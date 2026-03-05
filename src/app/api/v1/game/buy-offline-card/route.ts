export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

// Catalog of available offline upgrades
export const OFFLINE_CARDS: Record<string, { name: string, cost: number, rateIncrease: number, description: string }> = {
    'card_basic_mining': { name: 'Basic Mining Rig', cost: 1000, rateIncrease: 50, description: '+50 points/hour' },
    'card_advanced_ai': { name: 'Advanced AI Trader', cost: 5000, rateIncrease: 300, description: '+300 points/hour' },
    'card_quantum_processor': { name: 'Quantum Processor', cost: 25000, rateIncrease: 2000, description: '+2k points/hour' },
    'card_dark_matter': { name: 'Dark Matter Harvester', cost: 100000, rateIncrease: 10000, description: '+10k points/hour' },
};

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
        const { cardId } = await req.json();

        if (!cardId || !OFFLINE_CARDS[cardId]) {
            return NextResponse.json({ success: false, error: 'Invalid card ID' }, { status: 400 });
        }

        const card = OFFLINE_CARDS[cardId];

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { telegramId } });
            if (!user) throw new Error('USER_NOT_FOUND');

            // 1. Check if already owns card
            const currentCards = (user.offlineCards as string[]) || [];
            if (currentCards.includes(cardId)) {
                throw new Error('ALREADY_OWNED');
            }

            // 2. Check affordability
            if (user.points < card.cost) {
                throw new Error('INSUFFICIENT_FUNDS');
            }

            // 3. Purchase: Deduct points, add card, increase rate
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: {
                    points: { decrement: card.cost },
                    offlineCards: [...currentCards, cardId],
                    offlinePointsRate: { increment: card.rateIncrease }
                }
            });

            // 4. Record Transaction
            await tx.transaction.create({
                data: {
                    userId: user.id,
                    type: 'SPEND',
                    context: `BUY_CARD_${cardId}`,
                    amount: card.cost,
                    currency: 'POINTS'
                }
            });

            return updatedUser;
        });

        return NextResponse.json({
            success: true,
            data: {
                points: result.points,
                offlinePointsRate: result.offlinePointsRate,
                offlineCards: result.offlineCards
            }
        });

    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Server error';

        const errorMap: Record<string, number> = {
            'USER_NOT_FOUND': 404,
            'ALREADY_OWNED': 409,
            'INSUFFICIENT_FUNDS': 400
        };

        return NextResponse.json(
            { success: false, error: msg },
            { status: errorMap[msg] || 500 }
        );
    }
}
