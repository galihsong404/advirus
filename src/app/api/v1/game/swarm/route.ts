export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data') || '';
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken || !validateTelegramInitData(initData, botToken)) {
            if (process.env.NODE_ENV !== 'development' || botToken) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }
        }

        const { searchParams } = new URL(req.url);
        const swarmId = searchParams.get('swarmId');

        // Fetch a specific swarm
        if (swarmId) {
            const swarm = await prisma.swarm.findUnique({
                where: { id: swarmId },
                include: { members: { select: { id: true, telegramId: true, highestLevelReached: true, points: true } } }
            });
            if (!swarm) return NextResponse.json({ success: false, error: 'Swarm not found' }, { status: 404 });
            return NextResponse.json({ success: true, data: swarm });
        }

        // Fetch top swarms by member count or totalSynergy
        const swarms = await prisma.swarm.findMany({
            take: 20,
            orderBy: { totalSynergy: 'desc' },
            include: {
                _count: {
                    select: { members: true }
                }
            }
        });

        return NextResponse.json({ success: true, data: swarms });

    } catch (e: unknown) {
        console.error("Swarm GET Error:", e);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data') || '';
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken || !validateTelegramInitData(initData, botToken)) {
            if (process.env.NODE_ENV !== 'development' || botToken) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }
        }

        const parsed = parseTelegramInitData(initData);
        if (!parsed || !parsed.user) return NextResponse.json({ success: false, error: 'Invalid user data' }, { status: 400 });

        const telegramId = parsed.user.id.toString();
        const body = await req.json();
        const { name } = body;

        if (!name || name.length < 3 || name.length > 20) {
            return NextResponse.json({ success: false, error: 'Swarm name must be 3-20 characters' }, { status: 400 });
        }

        const SWARM_CREATION_COST = 500; // Costs 500 Gold

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

        if (user.swarmId) {
            return NextResponse.json({ success: false, error: 'You are already in a Swarm' }, { status: 400 });
        }

        if (user.gold < SWARM_CREATION_COST) {
            return NextResponse.json({ success: false, error: `Not enough Gold. Need ${SWARM_CREATION_COST}.` }, { status: 400 });
        }

        const existingSwarm = await prisma.swarm.findUnique({ where: { name } });
        if (existingSwarm) {
            return NextResponse.json({ success: false, error: 'Swarm name already taken' }, { status: 400 });
        }

        const newSwarm = await prisma.$transaction(async (tx) => {
            // Deduct cost
            await tx.user.update({
                where: { id: user.id },
                data: { gold: { decrement: SWARM_CREATION_COST } }
            });

            // Create Swarm
            const swarm = await tx.swarm.create({
                data: {
                    name,
                    chiefId: telegramId,
                    members: {
                        connect: { id: user.id }
                    }
                }
            });

            return swarm;
        });

        return NextResponse.json({ success: true, data: newSwarm });

    } catch (e: unknown) {
        console.error("Swarm POST Error:", e);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const initData = req.headers.get('X-TG-Init-Data') || '';
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken || !validateTelegramInitData(initData, botToken)) {
            if (process.env.NODE_ENV !== 'development' || botToken) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }
        }

        const parsed = parseTelegramInitData(initData);
        if (!parsed || !parsed.user) return NextResponse.json({ success: false, error: 'Invalid user data' }, { status: 400 });

        const telegramId = parsed.user.id.toString();
        const body = await req.json();
        const { swarmId, action } = body; // action can be 'join' or 'leave'

        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

        if (action === 'leave') {
            if (!user.swarmId) return NextResponse.json({ success: false, error: 'Not in a Swarm' }, { status: 400 });

            await prisma.user.update({
                where: { id: user.id },
                data: { swarmId: null }
            });

            // If chief leaves, either delete swarm or pass leadership (keep it simple: delete if empty)
            const remainingMembers = await prisma.user.count({ where: { swarmId: user.swarmId } });
            if (remainingMembers === 0) {
                await prisma.swarm.delete({ where: { id: user.swarmId as string } });
            }

            return NextResponse.json({ success: true, message: 'Left Swarm' });
        }

        if (action === 'join') {
            if (!swarmId) return NextResponse.json({ success: false, error: 'Swarm ID required' }, { status: 400 });
            if (user.swarmId) return NextResponse.json({ success: false, error: 'Already in a Swarm' }, { status: 400 });

            const swarm = await prisma.swarm.findUnique({ where: { id: swarmId } });
            if (!swarm) return NextResponse.json({ success: false, error: 'Swarm not found' }, { status: 404 });

            await prisma.user.update({
                where: { id: user.id },
                data: { swarmId }
            });

            return NextResponse.json({ success: true, message: 'Joined Swarm' });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

    } catch (e: unknown) {
        console.error("Swarm PUT Error:", e);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
