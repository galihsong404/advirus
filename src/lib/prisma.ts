import { PrismaClient } from '@prisma/client'

// Use a Proxy to ensure PrismaClient is only instantiated when actually accessed.
// This prevents Next.js 'Collecting page data' from crashing during build if env vars are missing.
let _prisma: PrismaClient | undefined;

const prisma = new Proxy({} as PrismaClient, {
    get(target, prop, receiver) {
        if (prop === 'then') return undefined; // Prevent issues with async detection
        if (!_prisma) {
            _prisma = new PrismaClient();
        }
        return Reflect.get(_prisma, prop, receiver);
    }
});

export default prisma;
export const getPrisma = () => prisma;
