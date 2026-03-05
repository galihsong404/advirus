import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Telegram sends webhooks for `pre_checkout_query` (to approve the invoice before payment)
// and `successful_payment` (after the user actually pays).
export async function POST(req: NextRequest) {
    try {
        // Telegram bots MUST be secured using a secret token in the webhook URL or headers.
        // For standard bot webhooks, Telegram passes `x-telegram-bot-api-secret-token`
        const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
        const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;

        // Skip auth if testing locally without a token configured
        if (expectedToken && secretToken !== expectedToken && process.env.NODE_ENV !== 'development') {
            console.warn("Unauthorized webhook attempt");
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();

        // 1. Handle pre_checkout_query
        // When a user clicks "Pay", Telegram asks our bot: "Is this still available?"
        if (body.pre_checkout_query) {
            const query = body.pre_checkout_query;
            // Parse payload from the invoice creation `payload` field
            let payloadData;
            try {
                payloadData = JSON.parse(query.invoice_payload);
            } catch {
                return NextResponse.json({ ok: true, pre_checkout_query_id: query.id, ok_status: false, error_message: "Invalid payload format" });
            }

            // BUG-06 FIX: Validate payload before approving checkout
            const VALID_ITEMS = ['Gold', 'Energy'];
            if (!payloadData?.itemId || !VALID_ITEMS.includes(payloadData.itemId)) {
                const botTokenReject = process.env.TELEGRAM_BOT_TOKEN;
                if (botTokenReject) {
                    await fetch(`https://api.telegram.org/bot${botTokenReject}/answerPreCheckoutQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pre_checkout_query_id: query.id,
                            ok: false,
                            error_message: 'Invalid item in invoice.'
                        })
                    });
                }
                return NextResponse.json({ success: false, message: 'Invalid item rejected' });
            }

            if (!payloadData.amount || payloadData.amount <= 0) {
                const botTokenReject2 = process.env.TELEGRAM_BOT_TOKEN;
                if (botTokenReject2) {
                    await fetch(`https://api.telegram.org/bot${botTokenReject2}/answerPreCheckoutQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pre_checkout_query_id: query.id,
                            ok: false,
                            error_message: 'Invalid amount.'
                        })
                    });
                }
                return NextResponse.json({ success: false, message: 'Invalid amount rejected' });
            }

            // Acknowledge the checkout and allow it to proceed
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
                await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pre_checkout_query_id: query.id,
                        ok: true
                    })
                });
            }
            return NextResponse.json({ success: true, message: 'pre_checkout approved' });
        }

        // 2. Handle successful_payment
        // This comes inside the `message` object from a private chat update
        if (body.message?.successful_payment) {
            const payment = body.message.successful_payment;
            const telegramId = body.message.from.id.toString();

            let payloadData;
            try {
                payloadData = JSON.parse(payment.invoice_payload);
            } catch (e) {
                console.error("Failed to parse invoice payload on success:", payment.invoice_payload);
                return NextResponse.json({ success: false, error: 'Bad Payload' });
            }

            const { userId, itemId, amount } = payloadData;

            // 2a. IDEMPOTENCY CHECK
            // Ensure we haven't already processed this exact Telegram payment charge ID
            const existingTx = await prisma.transaction.findUnique({
                where: { providerId: payment.telegram_payment_charge_id }
            });

            if (existingTx) {
                console.log(`Payment ${payment.telegram_payment_charge_id} already processed.`);
                return NextResponse.json({ success: true, message: 'Already processed' });
            }

            // 2b. Authoritative DB Update
            await prisma.$transaction(async (tx) => {
                let user = await tx.user.findUnique({ where: { telegramId } });
                if (!user && userId) {
                    user = await tx.user.findUnique({ where: { id: userId } });
                }
                if (!user) throw new Error("USER_NOT_FOUND");

                // Update balance based on what they bought
                if (itemId === 'Gold') {
                    await tx.user.update({
                        where: { id: user.id },
                        data: { gold: { increment: amount } }
                    });
                } else if (itemId === 'Energy') {
                    await tx.user.update({
                        where: { id: user.id },
                        data: { energy: 10 } // Full refill
                    });
                }

                // Record Transaction
                await tx.transaction.create({
                    data: {
                        userId: user.id,
                        type: 'EARN',
                        context: 'STAR_PAYMENT',
                        amount: payment.total_amount,
                        currency: 'STARS',
                        itemId: itemId,
                        itemAmount: amount,
                        providerId: payment.telegram_payment_charge_id,
                        status: 'COMPLETED'
                    }
                });
            });

            console.log(`Successfully verified and rewarded ${amount} ${itemId} to ${telegramId}`);
            return NextResponse.json({ success: true, message: 'Rewarded' });
        }

        // 3. Unhandled update types
        return NextResponse.json({ success: true, message: 'Ignored update type' });

    } catch (e) {
        console.error("Webhook Error:", e);
        const errorMessage = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
