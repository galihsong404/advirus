import CryptoJS from 'crypto-js';

/**
 * Validates the data received from the Telegram Web App.
 * @param initData The raw initData string from window.Telegram.WebApp.initData
 * @param botToken The Telegram Bot Token
 * @returns boolean indicating if the data is valid
 */
export function validateTelegramInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  // ANTI-CHEAT FIX #1: "Forever Token" Prevention
  // Reject tokens older than 24 hours to block bot scripts using stolen initData
  const authDateStr = urlParams.get('auth_date');
  if (authDateStr) {
    const authDateSec = parseInt(authDateStr, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    const MAX_AGE_SEC = 86400; // 24 hours
    if (isNaN(authDateSec) || (nowSec - authDateSec) > MAX_AGE_SEC) {
      console.warn(`Token expired: auth_date=${authDateSec}, now=${nowSec}, age=${nowSec - authDateSec}s`);
      return false;
    }
  }

  // Sort keys alphabetically
  const keys = Array.from(urlParams.keys()).sort();
  const dataCheckString = keys
    .map((key) => `${key}=${urlParams.get(key)}`)
    .join('\n');

  // Generate secret key using HMAC-SHA256 with "WebAppData" as key and botToken as data
  const secretKey = CryptoJS.HmacSHA256(botToken, 'WebAppData');

  // Calculate hash of dataCheckString using secretKey
  const calculatedHash = CryptoJS.HmacSHA256(dataCheckString, secretKey).toString(CryptoJS.enc.Hex);

  return calculatedHash === hash;
}

/**
 * Parses the initData string into a usable object.
 */
export function parseTelegramInitData(initData: string) {
  const urlParams = new URLSearchParams(initData);
  const userString = urlParams.get('user');

  // P1-JSON-CRASH FIX: Prevent server crash on malformed user JSON
  let user = null;
  if (userString) {
    try { user = JSON.parse(userString); } catch { user = null; }
  }

  return {
    query_id: urlParams.get('query_id'),
    user,
    auth_date: urlParams.get('auth_date'),
    hash: urlParams.get('hash'),
  };
}
