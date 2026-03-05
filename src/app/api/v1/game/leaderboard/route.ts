export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        // Verify the user is a legitimate Telegram player (anti-scraping)
        if (!initData || !botToken || !validateTelegramInitData(initData, botToken)) {
            // For local development, allow skipping auth if bot token isn't set
            if (process.env.NODE_ENV !== 'development' || botToken) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }
        }

        const { searchParams } = new URL(req.url);
        const sortBy = searchParams.get('sortBy') || 'points'; // 'points' or 'level'
        const limitStr = searchParams.get('limit');
        const limit = limitStr ? parseInt(limitStr, 10) : 50;

        // Ensure limit maxes out at 100 for performance
        const safeLimit = Math.min(Math.max(1, limit), 100);

        let orderBy = {};
        if (sortBy === 'level') {
            orderBy = { highestLevelReached: 'desc' };
        } else {
            orderBy = { points: 'desc' };
        }

        // Fetch top players, selecting only public/safe info
        const leaderboard = await prisma.user.findMany({
            take: safeLimit,
            orderBy,
            select: {
                id: true,
                telegramId: true,
                points: true,
                highestLevelReached: true,
                currentStreak: true,
                createdAt: true,
                // We don't have usernames stored explicitly right now beyond TelegramId, 
                // but we could select other profile data here if added later.
            }
        });

        // Map and obscure any extremely sensitive IDs if necessary, 
        // though internal IDs are generally fine to expose for a leaderboard if they aren't auth tokens.
        const safeLeaderboard = leaderboard.map((user, index) => ({
            rank: index + 1,
            id: user.id,
            // Mask the telegram ID for privacy, e.g., "123****89"
            displayName: `Player_${user.telegramId.substring(user.telegramId.length - 4)}`,
            points: user.points,
            level: user.highestLevelReached,
            streak: user.currentStreak
        }));

        return NextResponse.json({
            success: true,
            data: safeLeaderboard
        });

    } catch (error: any) {
        console.error("Leaderboard Fetch Error:", error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
