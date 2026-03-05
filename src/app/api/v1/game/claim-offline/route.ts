export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

/**
 * ANTI-CHEAT FIX #4: "Infinite Offline" Prevention
 * Server-side offline point claim. Client CANNOT manipulate offlinePointsRate or lastOfflineClaim.
 */
export async function POST(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (!validateTelegramInitData(initData, botToken)) {
            return NextResponse.json({ success: false, error: 'Invalid hash' }, { status: 401 });
        }

        const userData = parseTelegramInitData(initData);
        if (!userData.user?.id) {
            return NextResponse.json({ success: false, error: 'Invalid user data' }, { status: 400 });
        }

        const telegramId = userData.user.id.toString();
        const now = new Date();
        const MAX_OFFLINE_HOURS = 8;

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { telegramId } });
            if (!user) throw new Error('USER_NOT_FOUND');

            // Server-authoritative calculation
            const elapsedMs = now.getTime() - user.lastOfflineClaim.getTime();
            const hoursElapsed = elapsedMs / 3600000;
            const clampedHours = Math.min(hoursElapsed, MAX_OFFLINE_HOURS);
            const earnedPoints = Math.floor(clampedHours * user.offlinePointsRate);

            if (earnedPoints <= 0) {
                return { earnedPoints: 0, newPoints: user.points, nextClaimAvailable: user.lastOfflineClaim };
            }

            // Atomic update: add points + reset claim timer
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: {
                    points: { increment: earnedPoints },
                    lastOfflineClaim: now
                }
            });

            // Log transaction
            await tx.transaction.create({
                data: {
                    userId: user.id,
                    type: 'EARN',
                    context: 'OFFLINE_CLAIM',
                    amount: earnedPoints,
                    currency: 'POINTS'
                }
            });

            return {
                earnedPoints,
                newPoints: updatedUser.points,
                offlinePointsRate: updatedUser.offlinePointsRate,
                hoursAccumulated: parseFloat(clampedHours.toFixed(2)),
                maxHours: MAX_OFFLINE_HOURS
            };
        });

        return NextResponse.json({ success: true, data: result });

    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        const status = msg === 'USER_NOT_FOUND' ? 404 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
