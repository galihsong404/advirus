export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramInitData, parseTelegramInitData } from '@/lib/telegram';
import prisma from '@/lib/prisma';
import CryptoJS from 'crypto-js';

/**
 * ANTI-CHEAT FIX #3: "Phantom Ad" Prevention
 * Issues a server-signed ad token that must be presented to /mutate.
 * Tokens expire after 5 minutes, preventing hoarding and unauthorized mutation calls.
 */

// BUG-07 FIX: Derive ad token secret from bot token via HMAC, not reuse it directly
const AD_TOKEN_SECRET = CryptoJS.HmacSHA256('advirus-ad-token-secret', process.env.TELEGRAM_BOT_TOKEN || 'fallback').toString();
const AD_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
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

        // Verify user exists
        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        // Generate a server-signed ad token
        const issuedAt = Date.now();
        const payload = `${telegramId}:${issuedAt}`;
        const signature = CryptoJS.HmacSHA256(payload, AD_TOKEN_SECRET).toString(CryptoJS.enc.Hex);

        const adToken = `${payload}:${signature}`;

        return NextResponse.json({
            success: true,
            data: {
                adToken,
                expiresIn: AD_TOKEN_EXPIRY_MS,
                expiresAt: new Date(issuedAt + AD_TOKEN_EXPIRY_MS).toISOString()
            }
        });

    } catch (e) {
        console.error('Request Ad Token Error:', e);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}

/**
 * Utility: Verify an ad token (used by mutate route)
 */
export function verifyAdToken(adToken: string, expectedTelegramId: string): boolean {
    try {
        const parts = adToken.split(':');
        if (parts.length !== 3) return false;

        const [telegramId, issuedAtStr, signature] = parts;

        // Check identity
        if (telegramId !== expectedTelegramId) return false;

        // Check expiry
        const issuedAt = parseInt(issuedAtStr, 10);
        if (isNaN(issuedAt) || (Date.now() - issuedAt) > AD_TOKEN_EXPIRY_MS) return false;

        // Verify signature
        const payload = `${telegramId}:${issuedAtStr}`;
        const expectedSig = CryptoJS.HmacSHA256(payload, AD_TOKEN_SECRET).toString(CryptoJS.enc.Hex);

        return signature === expectedSig;
    } catch {
        return false;
    }
}
