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
        // Trust only: lastLoginDate, offlineCards (if we track views), highestLevelReached
        await prisma.user.update({
            where: { telegramId },
            data: {
                lastLoginDate: clientState.lastLoginDate,
                highestLevelReached: clientState.highestLevelReached,
                // Only track the offline claim time to prevent double-claiming if we eventually move that to server
                lastOfflineClaim: clientState.lastOfflineClaim ? new Date(clientState.lastOfflineClaim) : undefined
            }
        });

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            serverAcknowledged: true
        });

    } catch (error) {
        return NextResponse.json({ success: false, error: { code: 'ERR_DB_UNAVAILABLE' } }, { status: 500 });
    }
}
