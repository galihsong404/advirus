/**
 * Mock Monetag SDK Simulation
 * In production, this would use the real Monetag Zone IDs and Auction Keys.
 */

export interface AdSession {
    sessionId: string;
    status: 'pending' | 'completed' | 'failed';
    brand?: string;
}

export async function triggerMonetagAuction(): Promise<AdSession> {
    // Simulate RTB Bidding delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const brands = ['Shopee', 'Tokopedia', 'Binance', 'Lazada', 'Gojek'];
    const winingBrand = brands[Math.floor(Math.random() * brands.length)];

    return {
        sessionId: `mt_${Math.random().toString(36).substr(2, 9)}`,
        status: 'pending',
        brand: winingBrand
    };
}

export async function showRewardedAd(sessionId: string): Promise<boolean> {
    // Simulate watching a 15-second ad (shortened for testing)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 95% success rate simulation
    return Math.random() > 0.05;
}
