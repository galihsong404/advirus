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
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const todayDateZeroed = new Date(now);
        todayDateZeroed.setHours(0, 0, 0, 0);

        // Authoritative Database Transaction
        const result = await prisma.$transaction(async (tx: any) => {
            const user = await tx.user.findUnique({
                where: { telegramId }
            });

            if (!user) throw new Error('USER_NOT_FOUND');

            // 1. Check if already claimed today
            if (user.lastStreakClaimDate === todayStr) {
                return {
                    alreadyClaimed: true,
                    user,
                    bonusPoints: 0,
                    bonusGold: 0
                };
            }

            // 2. Calculate New Streak
            let newStreak = user.currentStreak;

            if (user.lastLoginDate) {
                const lastLoginArray = user.lastLoginDate.split('T')[0];
                const lastDate = new Date(lastLoginArray);
                lastDate.setHours(0, 0, 0, 0);

                const diffDays = Math.floor((todayDateZeroed.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    newStreak += 1;
                } else if (diffDays > 1 && user.lastLoginDate !== todayStr) {
                    // Reset streak if missed a day (and they didn't just login today without claiming)
                    newStreak = 1;
                }
            } else {
                newStreak = 1;
            }

            // 3. Calculate Rewards (Server-Authoritative)
            const streakMultiplier = Math.min(newStreak, 30);
            let bonusPoints = 100 * streakMultiplier;
            let bonusGold = 2 * streakMultiplier;

            if (newStreak === 7) { bonusPoints += 5000; bonusGold += 100; }
            else if (newStreak === 14) { bonusPoints += 15000; bonusGold += 500; }
            else if (newStreak === 30) { bonusPoints += 50000; bonusGold += 2000; }
            else if (newStreak === 60) { bonusPoints += 150000; bonusGold += 5000; }
            else if (newStreak === 90) { bonusPoints += 500000; bonusGold += 15000; }

            // 4. Update Database
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: {
                    currentStreak: newStreak,
                    lastLoginDate: todayStr,
                    lastStreakClaimDate: todayStr,
                    points: { increment: bonusPoints },
                    gold: { increment: bonusGold },
                    // Reset daily combo & ad quotas automatically when claiming streak as it's the start of a "new day" for them
                    dailyAdsWatched: 0,
                    dailyEnergyRefills: 0,
                    dailyCombo: [],
                    dailyComboClaimed: false
                }
            });

            // 5. Log Transaction
            if (bonusPoints > 0 || bonusGold > 0) {
                await tx.transaction.create({
                    data: {
                        userId: user.id,
                        type: 'EARN',
                        context: 'DAILY_STREAK',
                        amount: bonusPoints,
                        currency: 'POINTS'
                    }
                });
            }

            return {
                alreadyClaimed: false,
                user: updatedUser,
                bonusPoints,
                bonusGold
            };
        });

        if (result.alreadyClaimed) {
            return NextResponse.json({
                success: true,
                alreadyClaimed: true,
                data: {
                    currentStreak: result.user.currentStreak,
                    lastLoginDate: result.user.lastLoginDate,
                    lastStreakClaimDate: result.user.lastStreakClaimDate,
                    points: result.user.points,
                    gold: result.user.gold
                }
            });
        }

        return NextResponse.json({
            success: true,
            alreadyClaimed: false,
            data: {
                currentStreak: result.user.currentStreak,
                lastLoginDate: result.user.lastLoginDate,
                lastStreakClaimDate: result.user.lastStreakClaimDate,
                points: result.user.points,
                gold: result.user.gold,
                bonusPoints: result.bonusPoints,
                bonusGold: result.bonusGold
            }
        });

    } catch (error: any) {
        console.error('Streak Claim Error:', error);
        if (error.message === 'USER_NOT_FOUND') {
            return NextResponse.json({ success: false, error: 'User not found. Please sync first.' }, { status: 404 });
        }
        return NextResponse.json(
            { success: false, error: { code: 'ERR_DB_UNAVAILABLE', message: 'Internal server error' } },
            { status: 500 }
        );
    }
}
