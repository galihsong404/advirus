import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Trait {
    layerId: string;
    traitId: string;
    hex: string;
}

interface MutationServerResponse {
    approvedTrait?: Partial<Trait>;
    newSynergyScore?: number;
    pointsEarned?: number;
    goldEarned?: number;
    energyRemaining?: number;
    newLevel?: number;
    newProgress?: number;
    didLevelUp?: boolean;
    genome?: Trait[];
}

interface GameState {
    points: number;
    gold: number;
    energy: number;
    level: number;
    highestLevelReached: number; // For Collection Gallery
    progress: number;
    synergyScore: number;
    swarmId: string | null;
    mutations: number;
    lastEnergyUpdate: number;
    currentStreak: number;
    lastLoginDate: string | null;
    lastStreakClaimDate: string | null; // Prevent claiming the daily base bonus multiple times a day
    dailyAdsWatched: number; // Track for the 15/day requirement and 50/day cap
    lastAdWatchTime: number; // For 15 minute cooldown
    dailyEnergyRefills: number; // Track for escalating energy price (Anti-Whale Tax)
    dailyCombo: string[]; // Track unique traits acquired today
    dailyComboClaimed: boolean;
    offlinePointsRate: number; // Points per hour generated passively
    lastOfflineClaim: number; // Timestamp of last auto/manual claim
    offlineCards: string[]; // Array of card IDs owned by player
    genome: Trait[];

    // Actions
    addPoints: (amount: number) => void;
    addGold: (amount: number) => void;
    consumeEnergy: () => boolean;
    buyEnergyWithGold: (initDataStr: string) => Promise<{ success: boolean; costPaid?: number; nextCost?: number; error?: string }>;
    refillEnergy: () => void;
    mutate: (serverData: MutationServerResponse) => void;
    syncState: (data: any) => void;
    checkStreak: (initDataStr: string) => Promise<{ bonusPoints: number, bonusGold: number, alreadyClaimed: boolean } | void>;
    buyOfflineCard: (cardId: string, cost: number, rateIncrease: number) => Promise<boolean>;
    buyOfflineCardServer: (cardId: string, initData: string) => Promise<boolean>;
    claimOfflinePoints: (initData: string) => Promise<number>;
}

export const useGameStore = create<GameState>()(
    persist(
        (set, get) => ({
            points: 0,
            gold: 0,
            energy: 10,
            level: 0,
            highestLevelReached: 0,
            progress: 0,
            synergyScore: 1.0,
            swarmId: null,
            mutations: 0,
            lastEnergyUpdate: Date.now(),
            currentStreak: 1,
            lastLoginDate: null,
            lastStreakClaimDate: null,
            dailyAdsWatched: 0,
            lastAdWatchTime: 0,
            dailyEnergyRefills: 0,
            dailyCombo: [],
            dailyComboClaimed: false,
            offlinePointsRate: 0,
            lastOfflineClaim: Date.now(),
            offlineCards: [],
            genome: [
                { layerId: "background_layer", traitId: "bg_digital_void", hex: "#000000" },
                { layerId: "master_sprite", traitId: "monster_lvl0_v0", hex: "#00ffcc" },
                { layerId: "fx_layer", traitId: "fx_none", hex: "#ffffff" }
            ],

            addPoints: (amount) => set((state) => ({ points: state.points + amount })),
            addGold: (amount) => set((state) => ({ gold: state.gold + amount })),

            // LOGIC-04 FIX: No longer optimistically consume energy client-side.
            // Energy is ONLY updated from server response to prevent desync.
            consumeEnergy: () => {
                const { energy } = get();
                return energy > 0; // Just a check, no mutation
            },

            // P1-01 FIX: Server-authoritative energy purchase
            buyEnergyWithGold: async (initDataStr: string) => {
                try {
                    const response = await fetch('/api/v1/game/buy-energy', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-TG-Init-Data': initDataStr
                        }
                    });

                    const result = await response.json();
                    if (result.success && result.data) {
                        set({
                            gold: result.data.gold,
                            energy: result.data.energy,
                            dailyEnergyRefills: result.data.dailyEnergyRefills,
                            lastEnergyUpdate: Date.now()
                        });
                        return { success: true, costPaid: result.data.costPaid, nextCost: result.data.nextCost };
                    }
                    return { success: false, error: result.error || 'Failed' };
                } catch (e) {
                    console.error("Buy energy failed", e);
                    return { success: false, error: 'Network error' };
                }
            },

            refillEnergy: () => set({ energy: 10, lastEnergyUpdate: Date.now() }),

            checkStreak: async (initDataStr: string) => {
                const { lastStreakClaimDate } = get();
                const today = new Date().toISOString().split('T')[0];

                // Optimistic check to avoid unnecessary network request
                if (lastStreakClaimDate === today) return;

                try {
                    const response = await fetch('/api/v1/game/claim-streak', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-TG-Init-Data': initDataStr
                        }
                    });

                    if (!response.ok) return;

                    const result = await response.json();
                    if (result.success && result.data) {
                        const { data } = result;

                        // Atomic updater using server-authoritative values
                        set((state) => ({
                            currentStreak: data.currentStreak,
                            lastLoginDate: data.lastLoginDate,
                            lastStreakClaimDate: data.lastStreakClaimDate,
                            points: data.points,
                            gold: data.gold,
                            // If we claimed successfully (not already claimed), these were reset on server
                            ...(result.alreadyClaimed ? {} : {
                                dailyAdsWatched: 0,
                                dailyEnergyRefills: 0,
                                dailyCombo: [],
                                dailyComboClaimed: false
                            })
                        }));

                        // Optional: Return the bonus points/gold so the UI can show a celebration
                        return {
                            bonusPoints: data.bonusPoints || 0,
                            bonusGold: data.bonusGold || 0,
                            alreadyClaimed: result.alreadyClaimed
                        };
                    }
                } catch (e) {
                    console.error("Streak sync failed", e);
                }
            },

            buyOfflineCard: async (cardId, cost, rateIncrease) => {
                // FALLBACK for old UI or signature mismatch, though unused currently.
                console.warn('buyOfflineCard requires initData now. Use UI that passes it.');
                return false;
            },

            // NEW: Server-authoritative buy card
            buyOfflineCardServer: async (cardId: string, initData: string) => {
                try {
                    const res = await fetch('/api/v1/game/buy-offline-card', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
                        body: JSON.stringify({ cardId })
                    });
                    const result = await res.json();
                    if (result.success && result.data) {
                        set({
                            points: result.data.points,
                            offlinePointsRate: result.data.offlinePointsRate,
                            offlineCards: result.data.offlineCards
                        });
                        return true;
                    }
                    return false;
                } catch (e) {
                    console.error("Failed to buy card", e);
                    return false;
                }
            },

            claimOfflinePoints: async (initData: string) => {
                try {
                    const res = await fetch('/api/v1/game/claim-offline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData }
                    });
                    const result = await res.json();
                    if (result.success && result.data && result.data.earnedPoints > 0) {
                        set({ points: result.data.newPoints, offlinePointsRate: result.data.offlinePointsRate });
                        return result.data.earnedPoints;
                    }
                    return 0;
                } catch (e) {
                    console.error("Failed to claim offline points", e);
                    return 0;
                }
            },

            mutate: (serverData: MutationServerResponse) => set((state) => {
                // BUG-04 FIX: Use ONLY server-authoritative values for points/gold/energy.
                // Previously client was ADDING pointsEarned on top of server increment → 2x rewards.
                const newCombo = [...state.dailyCombo];
                if (serverData.approvedTrait?.traitId && !state.dailyComboClaimed && !newCombo.includes(serverData.approvedTrait.traitId)) {
                    newCombo.push(serverData.approvedTrait.traitId);
                }

                let comboClaimed = state.dailyComboClaimed;
                if (!comboClaimed && newCombo.length >= 3) {
                    comboClaimed = true;
                }

                return {
                    // Server-authoritative fields — DO NOT increment locally
                    genome: serverData.genome || state.genome,
                    level: serverData.newLevel ?? state.level, // BUG-01 FIX: removed Math.min(..., 10) clamp
                    progress: serverData.newProgress ?? state.progress,
                    synergyScore: serverData.newSynergyScore ?? state.synergyScore,
                    highestLevelReached: Math.max(serverData.newLevel ?? 0, state.highestLevelReached),
                    // LOGIC-04 FIX: energy comes from server response only
                    energy: serverData.energyRemaining ?? state.energy,
                    // Server already incremented these in DB, client mirrors via next sync
                    mutations: state.mutations + 1,
                    lastAdWatchTime: Date.now(),
                    // Combo (client-side tracking, harmless)
                    dailyCombo: newCombo,
                    dailyComboClaimed: comboClaimed,
                };
            }),

            syncState: (data) => set((state) => ({
                ...state,
                // Direct scalar mappings
                swarmId: data.swarmId ?? state.swarmId,
                points: data.points ?? state.points,
                gold: data.gold ?? state.gold,
                energy: data.energy ?? state.energy,
                // Nested: streak object → flat keys
                currentStreak: data.streak?.current ?? state.currentStreak,
                lastLoginDate: data.streak?.lastLogin ?? state.lastLoginDate,
                lastStreakClaimDate: data.streak?.lastStreakClaimDate ?? state.lastStreakClaimDate,
                // Nested: adQuota object → flat keys
                dailyAdsWatched: data.adQuota?.dailyAdsWatched ?? state.dailyAdsWatched,
                lastAdWatchTime: data.adQuota?.lastAdWatchTime ? new Date(data.adQuota.lastAdWatchTime).getTime() : state.lastAdWatchTime,
                // Nested: virus object → flat keys
                level: data.virus?.level ?? state.level,
                progress: data.virus?.progress ?? state.progress,
                mutations: data.virus?.mutations ?? state.mutations,
                synergyScore: data.virus?.synergyScore ?? state.synergyScore,
                genome: data.virus?.genome ?? state.genome,
                // Timestamps
                lastEnergyUpdate: data.lastEnergyUpdate ? new Date(data.lastEnergyUpdate).getTime() : state.lastEnergyUpdate,
                lastOfflineClaim: data.lastOfflineClaim ? new Date(data.lastOfflineClaim).getTime() : state.lastOfflineClaim,
                // BUG-05 FIX: Restore offline and progression fields from server
                offlineCards: data.offlineCards ?? state.offlineCards,
                offlinePointsRate: data.offlinePointsRate ?? state.offlinePointsRate,
                highestLevelReached: Math.max(data.highestLevelReached ?? 0, data.virus?.level ?? 0, state.highestLevelReached),
                dailyEnergyRefills: data.dailyEnergyRefills ?? state.dailyEnergyRefills,
            })),
        }),
        {
            name: 'advirus-game-storage',
        }
    )
);
