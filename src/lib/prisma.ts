import { PrismaClient } from '@prisma/client'

// P2-02 FIX: Lazy Proxy + globalThis cache combo.
// Proxy ensures PrismaClient is only instantiated when actually accessed at runtime
// (prevents Next.js build/page-data-collection from crashing if DB is unreachable).
// globalThis cache prevents connection pool exhaustion during dev hot-reload.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
};

const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
        if (prop === 'then') return undefined;
        if (!globalForPrisma.prisma) {
            globalForPrisma.prisma = new PrismaClient();
        }
        return Reflect.get(globalForPrisma.prisma, prop, receiver);
    }
});

export default prisma;

