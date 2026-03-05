export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

/**
 * P1-01 FIX: Server-side energy purchase to prevent client-side gold manipulation.
 * Validates gold balance, applies anti-whale escalating cost, and returns authoritative state.
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
        const BASE_COST = 50; // 50 Gold base
        const ENERGY_MAX = 10;

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { telegramId } });
            if (!user) throw new Error('USER_NOT_FOUND');

            // Anti-Whale Tax: Cost doubles with each refill per day
            const actualCost = BASE_COST * Math.pow(2, user.dailyEnergyRefills);

            if (user.gold < actualCost) {
                throw new Error('ERR_INSUFFICIENT_GOLD');
            }

            if (user.energy >= ENERGY_MAX) {
                throw new Error('ERR_ENERGY_FULL');
            }

            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: {
                    gold: { decrement: actualCost },
                    energy: ENERGY_MAX,
                    lastEnergyUpdate: new Date(),
                    dailyEnergyRefills: { increment: 1 }
                }
            });

            // Log transaction
            await tx.transaction.create({
                data: {
                    userId: user.id,
                    type: 'SPEND',
                    context: 'ENERGY_PURCHASE',
                    amount: actualCost,
                    currency: 'GOLD'
                }
            });

            return {
                gold: updatedUser.gold,
                energy: updatedUser.energy,
                dailyEnergyRefills: updatedUser.dailyEnergyRefills,
                costPaid: actualCost,
                nextCost: BASE_COST * Math.pow(2, updatedUser.dailyEnergyRefills)
            };
        });

        return NextResponse.json({ success: true, data: result });

    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';
        const errorMap: Record<string, number> = {
            'USER_NOT_FOUND': 404,
            'ERR_INSUFFICIENT_GOLD': 400,
            'ERR_ENERGY_FULL': 400
        };
        const status = errorMap[msg] || 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
