export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken) {
            return NextResponse.json(
                { success: false, error: { code: 'ERR_INIT_DATA_INVALID', message: 'Missing initData or token' } },
                { status: 401 }
            );
        }

        const isValid = validateTelegramInitData(initData, botToken);

        if (!isValid) {
            return NextResponse.json(
                { success: false, error: { code: 'ERR_INIT_DATA_INVALID', message: 'Invalid hash' } },
                { status: 401 }
            );
        }

        const userData = parseTelegramInitData(initData);
        if (!userData.user?.id) {
            return NextResponse.json({ success: false, error: 'Invalid user data' }, { status: 400 });
        }

        const telegramId = userData.user.id.toString();

        // 2. Atomic Upsert: Ensure user and virus exist in a single round-trip
        const user = await prisma.user.upsert({
            where: { telegramId },
            update: {
                username: userData.user.username || null,
                firstName: userData.user.first_name || null,
            },
            create: {
                telegramId,
                username: userData.user.username || null,
                firstName: userData.user.first_name || null,
                virus: {
                    create: {
                        genome: [
                            { layerId: "background_layer", traitId: "bg_digital_void", hex: "#000000" },
                            { layerId: "master_sprite", traitId: "monster_lvl0_v0", hex: "#00ffcc" },
                            { layerId: "fx_layer", traitId: "fx_none", hex: "#ffffff" }
                        ]
                    }
                }
            },
            include: { virus: true }
        });

        return NextResponse.json({
            success: true,
            data: {
                userId: user.id,
                telegramId: user.telegramId,
                swarmId: user.swarmId,
                points: user.points,
                gold: user.gold,
                energy: user.energy,
                lastEnergyUpdate: user.lastEnergyUpdate.toISOString(),
                streak: {
                    current: user.currentStreak,
                    lastLogin: user.lastLoginDate,
                    lastStreakClaimDate: user.lastStreakClaimDate
                },
                adQuota: {
                    dailyAdsWatched: user.dailyAdsWatched,
                    lastAdWatchTime: user.lastAdWatchTime?.toISOString() || null,
                    dailyCap: 50,
                    cooldownMs: 15 * 60 * 1000
                },
                virus: {
                    level: user.virus?.level || 0,
                    progress: user.virus?.progress || 0,
                    mutations: user.virus?.mutations || 0,
                    synergyScore: user.virus?.synergyScore || 1.0,
                    genome: user.virus?.genome || []
                }
            }
        });

    } catch (error) {
        console.error('Sync Error:', error);
        return NextResponse.json(
            { success: false, error: { code: 'ERR_DB_UNAVAILABLE', message: 'Internal server error' } },
            { status: 500 }
        );
    }
}
