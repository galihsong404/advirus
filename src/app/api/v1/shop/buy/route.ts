export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';

// P0-PRICE FIX: Server-side price catalog — client CANNOT set price or amount
const SHOP_CATALOG: Record<string, { label: string; amount: number; priceStars: number }> = {
    Gold: { label: '1,000 Gold', amount: 1000, priceStars: 50 },
    Energy: { label: 'Full Energy Refill', amount: 10, priceStars: 25 },
};

export async function POST(req: NextRequest) {
    try {
        // P1-AUTH FIX: Validate Telegram initData before processing
        const initData = req.headers.get('X-TG-Init-Data');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!initData || !botToken) {
            // If no bot token is set (like in local dev), allow mock invoice
            if (!botToken && process.env.NODE_ENV === 'development') {
                const body = await req.json();
                const { itemId } = body;

                // P0-XSS FIX: Validate itemId against allowlist
                if (!itemId || !SHOP_CATALOG[itemId]) {
                    return NextResponse.json({ success: false, error: 'Invalid item' }, { status: 400 });
                }

                console.warn("TELEGRAM_BOT_TOKEN is not set. Generating mock invoice.");
                return NextResponse.json({
                    success: true,
                    invoiceLink: "https://t.me/$mock_invoice_12345",
                    item: SHOP_CATALOG[itemId]
                });
            }
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (!validateTelegramInitData(initData, botToken)) {
            return NextResponse.json({ success: false, error: 'Invalid hash' }, { status: 401 });
        }

        const body = await req.json();
        const { itemId } = body;

        // P0-XSS FIX: Validate itemId against allowlist — reject anything unknown
        if (!itemId || !SHOP_CATALOG[itemId]) {
            return NextResponse.json({ success: false, error: 'Invalid item ID' }, { status: 400 });
        }

        // P0-PRICE FIX: Use server-side catalog values, NOT client values
        const catalogItem = SHOP_CATALOG[itemId];

        // Call Telegram Bot API to create an invoice link for Telegram Stars
        const parsed = parseTelegramInitData(initData);
        const userId = parsed?.user?.id?.toString() || 'unknown';

        const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: catalogItem.label,
                description: `Purchase ${catalogItem.label} for your AdVirus Evolution Lab account.`,
                // P0-01 FIX: Use JSON payload so webhook can parse userId/itemId/amount
                payload: JSON.stringify({ userId, itemId, amount: catalogItem.amount }),
                provider_token: "", // Empty for Telegram Stars
                currency: "XTR", // Telegram Stars currency code
                prices: [{ label: catalogItem.label, amount: catalogItem.priceStars }],
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error("Telegram API Error:", data);
            return NextResponse.json({ success: false, error: data.description }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            invoiceLink: data.result
        });

    } catch (error) {
        console.error("Shop buy route error:", error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
