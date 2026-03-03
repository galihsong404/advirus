export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const DAILY_AD_CAP = 50;
const ENERGY_MAX = 10;
const ENERGY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function POST(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken) {
            return NextResponse.json({ success: false, error: { code: 'ERR_INIT_DATA_INVALID', message: 'Unauthorized' } }, { status: 401 });
        }

        // 1. Validate InitData
        if (!validateTelegramInitData(initData, botToken)) {
            return NextResponse.json({ success: false, error: { code: 'ERR_INIT_DATA_INVALID', message: 'Invalid hash' } }, { status: 401 });
        }

        const userData = parseTelegramInitData(initData);
        if (!userData.user?.id) {
            return NextResponse.json({ success: false, error: { code: 'ERR_INIT_DATA_INVALID' } }, { status: 400 });
        }
        const telegramId = userData.user.id.toString();

        const { adSessionId } = await req.json();

        // 2. Authoritative Database Transaction
        const result = await prisma.$transaction(async (tx: any) => {
            // A. Fetch User & Virus state
            const user = await tx.user.findUnique({
                where: { telegramId },
                include: { virus: true }
            });

            if (!user || !user.virus) {
                throw new Error('USER_NOT_FOUND');
            }

            // B. Security: Ad Session Burn (CVE-AV-006)
            // Note: In Phase 9, we check if a transaction with this payload already exists
            const existingTx = await tx.transaction.findFirst({
                where: { context: `MUTATION_${adSessionId}` }
            });
            if (existingTx) {
                throw new Error('ERR_AD_SESSION_EXPIRED');
            }

            // C. Rate Limiting: Daily Cap & Cooldown
            const now = new Date();
            const today = now.toISOString().split('T')[0];

            // Reset daily ads if it's a new day
            let dailyAdsWatched = user.dailyAdsWatched;
            if (user.lastLoginDate !== today) {
                dailyAdsWatched = 0;
            }

            if (dailyAdsWatched >= DAILY_AD_CAP) {
                throw new Error('ERR_DAILY_AD_CAP');
            }

            if (user.lastAdWatchTime) {
                const timeSinceLastAd = now.getTime() - user.lastAdWatchTime.getTime();
                if (timeSinceLastAd < COOLDOWN_MS) {
                    throw new Error('ERR_AD_COOLDOWN');
                }
            }

            // D. Authoritative Energy Logic
            // Calculate offline refills if not checked recently
            const elapsedEnergyMs = now.getTime() - user.lastEnergyUpdate.getTime();
            const refilledEnergy = Math.floor(elapsedEnergyMs / ENERGY_COOLDOWN_MS);
            let currentEnergy = Math.min(ENERGY_MAX, user.energy + refilledEnergy);

            if (currentEnergy <= 0) {
                throw new Error('ERR_ENERGY_DEPLETED');
            }

            // E. Logic: Calculate Reward & Server-Side Evolution
            const MUTATIONS_PER_LEVEL = 15;
            const PROGRESS_PER_MUTATION = parseFloat((100 / MUTATIONS_PER_LEVEL).toFixed(2)); // ~6.67

            const rarRoll = Math.random();
            let rarity: 'Common' | 'Rare' | 'Legendary' | 'Mythic' = 'Common';
            let R = 1.0; let B = 1.1;

            if (rarRoll > 0.98) { rarity = 'Mythic'; R = 3.0; B = 3.0; }
            else if (rarRoll > 0.90) { rarity = 'Legendary'; R = 2.0; B = 2.5; }
            else if (rarRoll > 0.70) { rarity = 'Rare'; R = 1.5; B = 1.5; }

            const currentLevel = user.virus.level;
            const synergyScore = parseFloat((3 * B * (1 + 0.2 * currentLevel) * R).toFixed(2));
            const streakMultiplier = (Math.min(user.currentStreak, 30) / 10) + 1;
            const pointsEarned = Math.floor(synergyScore * 250 * streakMultiplier);

            let goldEarned = 0;
            const goldRoll = Math.random();
            if (goldRoll > 0.99) goldEarned = Math.floor(Math.random() * 101) + 100;
            else if (goldRoll > 0.90) goldEarned = Math.floor(Math.random() * 41) + 10;
            else if (goldRoll > 0.60) goldEarned = Math.floor(Math.random() * 5) + 1;

            // F. SERVER-SIDE LEVEL-UP LOGIC
            let newProgress = parseFloat((user.virus.progress + PROGRESS_PER_MUTATION).toFixed(2));
            let newLevel = currentLevel;
            let didLevelUp = false;

            if (newProgress >= 100 && newLevel < 10) {
                newLevel = currentLevel + 1;
                newProgress = 0;
                didLevelUp = true;
            } else if (newProgress >= 100) {
                // Max level reached, cap progress
                newProgress = 100;
            }

            // G. Update User Points/Energy
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: {
                    points: { increment: pointsEarned },
                    gold: { increment: goldEarned },
                    energy: currentEnergy - 1,
                    lastEnergyUpdate: now,
                    dailyAdsWatched: dailyAdsWatched + 1,
                    lastAdWatchTime: now,
                    lastLoginDate: today,
                    highestLevelReached: Math.max(user.highestLevelReached || 0, newLevel)
                }
            });

            // H. Update Genome (Sprite + Background)
            const currentGenome = (user.virus.genome as any[]) || [];
            const updatedGenome = [...currentGenome];

            // H1. Update monster sprite on level-up
            if (didLevelUp && newLevel <= 10) {
                const spriteIdx = updatedGenome.findIndex((t: any) => t.layerId === 'master_sprite');
                const newSprite = { layerId: 'master_sprite', traitId: `monster_lvl${newLevel}_v1`, hex: '#00ffcc' };
                if (spriteIdx !== -1) updatedGenome[spriteIdx] = newSprite;
                else updatedGenome.push(newSprite);
            }

            // H2. Background changes ONLY on level-up (deterministic map)
            const levelBackgroundMap: Record<number, string> = {
                0: 'bg_digital_void',
                1: 'bg_biohazard_lab',
                2: 'bg_cosmic_nebula',
                3: 'bg_cyber_city',
                4: 'bg_frozen_data',
                5: 'bg_molten_core',
                6: 'bg_glitch_server',
                7: 'bg_zen_bridge',
                8: 'bg_deep_sea',
                9: 'bg_float_island',
                10: 'bg_solar_flare'
            };

            let chosenBg = levelBackgroundMap[currentLevel] || 'bg_digital_void'; // current bg
            if (didLevelUp) {
                chosenBg = levelBackgroundMap[newLevel] || 'bg_solar_flare';
                const bgIdx = updatedGenome.findIndex((t: any) => t.layerId === 'background_layer');
                const newBgTrait = { layerId: 'background_layer', traitId: chosenBg, hex: '#000000' };
                if (bgIdx !== -1) updatedGenome[bgIdx] = newBgTrait;
                else updatedGenome.push(newBgTrait);
            }

            // I. Persist Virus Evolution State
            const updatedVirus = await tx.virus.update({
                where: { id: user.virus.id },
                data: {
                    mutations: { increment: 1 },
                    level: newLevel,
                    progress: newProgress,
                    synergyScore: synergyScore,
                    genome: updatedGenome
                }
            });

            // J. Log Transaction
            await tx.transaction.create({
                data: {
                    userId: user.id,
                    type: 'EARN',
                    context: `MUTATION_${adSessionId}`,
                    amount: pointsEarned,
                    currency: 'POINTS'
                }
            });

            return { user: updatedUser, virus: updatedVirus, pointsEarned, goldEarned, rarity, chosenBg, synergyScore, newLevel, newProgress, didLevelUp, genome: updatedGenome };
        });

        return NextResponse.json({
            success: true,
            data: {
                approvedTrait: { layerId: 'background_layer', traitId: result.chosenBg, name: `${result.chosenBg.split('_').slice(1).join(' ').toUpperCase()} Environment`, rarity: result.rarity },
                newSynergyScore: result.synergyScore,
                pointsEarned: result.pointsEarned,
                goldEarned: result.goldEarned,
                energyRemaining: result.user.energy,
                // NEW: Server-Authoritative Evolution Data
                newLevel: result.newLevel,
                newProgress: result.newProgress,
                didLevelUp: result.didLevelUp,
                genome: result.genome,
                adState: {
                    dailyAdsWatched: result.user.dailyAdsWatched,
                    lastAdWatchTime: result.user.lastAdWatchTime?.toISOString(),
                    dailyCap: DAILY_AD_CAP,
                    cooldownMs: COOLDOWN_MS
                }
            }
        });

    } catch (error: any) {
        console.error('Mutation Error:', error);

        const errorMap: Record<string, { code: string; message: string; status: number }> = {
            'ERR_AD_SESSION_EXPIRED': { code: 'ERR_AD_SESSION_EXPIRED', message: 'This ad session has already been used.', status: 409 },
            'ERR_DAILY_AD_CAP': { code: 'ERR_DAILY_AD_CAP', message: `Daily ad limit reached (${DAILY_AD_CAP}).`, status: 429 },
            'ERR_AD_COOLDOWN': { code: 'ERR_AD_COOLDOWN', message: 'Cooldown active. Please wait.', status: 429 },
            'ERR_ENERGY_DEPLETED': { code: 'ERR_ENERGY_DEPLETED', message: 'Molecular Energy depleted.', status: 403 },
            'USER_NOT_FOUND': { code: 'ERR_INIT_DATA_INVALID', message: 'User record not found. Please sync first.', status: 404 }
        };

        const errorResponse = errorMap[error.message] || { code: 'ERR_INTERNAL', message: 'Internal server error', status: 500 };
        return NextResponse.json({ success: false, error: errorResponse }, { status: errorResponse.status });
    }
}
