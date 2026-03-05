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

        // P0-STATE-LOSS & P1-SYNC-RACE FIX:
        // NEVER trust client for: points, gold, energy, progress, level, genome, synergyScore
        // P1-02 FIX: Don't trust highestLevelReached from client either — use server max
        const existingUser = await prisma.user.findUnique({ where: { telegramId } });
        if (!existingUser) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const updatedUser = await prisma.user.update({
            where: { telegramId },
            data: {
                lastLoginDate: clientState.lastLoginDate,
                // P1-02 FIX: Server enforces max — client can never inflate
                highestLevelReached: Math.max(
                    existingUser.highestLevelReached,
                    typeof clientState.highestLevelReached === 'number' ? clientState.highestLevelReached : 0
                ),
                lastOfflineClaim: clientState.lastOfflineClaim ? new Date(clientState.lastOfflineClaim) : undefined
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
