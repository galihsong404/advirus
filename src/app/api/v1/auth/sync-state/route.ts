export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

/**
 * State Sync API (Mocking Redis Cluster interaction)
 * Dipanggil secara debounced (setiap 10s) untuk sinkronisasi state ke server.
 */

export async function POST(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken) {
            return NextResponse.json({ success: false, error: { code: 'ERR_INIT_DATA_INVALID' } }, { status: 401 });
        }

        if (!validateTelegramInitData(initData, botToken)) {
            return NextResponse.json({ success: false, error: { code: 'ERR_INIT_DATA_INVALID' } }, { status: 401 });
        }

        const clientState = await req.json();
        const userData = parseTelegramInitData(initData);
        const telegramId = userData.user?.id?.toString();

        if (!telegramId) {
            return NextResponse.json({ success: false, error: 'Invalid user' }, { status: 400 });
        }

        // ANTI-CHEAT FIX #2: "Time Traveler" Prevention
        // ZERO TRUST: Server NEVER accepts time-related fields from client.
        // lastLoginDate is set by /sync (boot) and /claim-streak only.
        // lastOfflineClaim is set by /claim-offline only.
        const existingUser = await prisma.user.findUnique({ where: { telegramId } });
        if (!existingUser) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                // Only accept highestLevelReached, clamped by server max
                highestLevelReached: Math.max(
                    existingUser.highestLevelReached,
                    typeof clientState.highestLevelReached === 'number' ? clientState.highestLevelReached : 0
                ),
                // ALL time fields are server-controlled only:
                // lastLoginDate — set by /sync and /claim-streak
                // lastOfflineClaim — set by /claim-offline
                // lastEnergyUpdate — set by /mutate and /buy-energy
            },
            include: { virus: true }
        });

        // P0-02 FIX: Return full authoritative state so client can sync
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            data: {
                points: updatedUser.points,
                gold: updatedUser.gold,
                energy: updatedUser.energy,
                swarmId: updatedUser.swarmId,
                lastEnergyUpdate: updatedUser.lastEnergyUpdate.toISOString(),
                streak: {
                    current: updatedUser.currentStreak,
                    lastLogin: updatedUser.lastLoginDate,
                    lastStreakClaimDate: updatedUser.lastStreakClaimDate
                },
                adQuota: {
                    dailyAdsWatched: updatedUser.dailyAdsWatched,
                    lastAdWatchTime: updatedUser.lastAdWatchTime?.toISOString() || null,
                    dailyCap: 50,
                    cooldownMs: 15 * 60 * 1000
                },
                virus: {
                    level: updatedUser.virus?.level || 0,
                    progress: updatedUser.virus?.progress || 0,
                    mutations: updatedUser.virus?.mutations || 0,
                    synergyScore: updatedUser.virus?.synergyScore || 1.0,
                    genome: updatedUser.virus?.genome || []
                }
            }
        });

    } catch (error) {
        console.error('Sync-State Error:', error);
        return NextResponse.json({ success: false, error: { code: 'ERR_DB_UNAVAILABLE' } }, { status: 500 });
    }
}
