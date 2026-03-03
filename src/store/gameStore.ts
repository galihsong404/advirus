import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Trait {
    layerId: string;
    traitId: string;
    hex: string;
}

interface GameState {
    points: number;
    gold: number;
    energy: number;
    level: number;
    highestLevelReached: number; // For Collection Gallery
    progress: number;
    synergyScore: number;
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
    buyEnergyWithGold: (amount: number, cost: number) => boolean;
    calculateEnergyRefill: () => void;
    refillEnergy: () => void;
    mutate: (trait: Partial<Trait>, pointsEarned: number, goldEarned: number, synergy: number) => void;
    syncState: (data: any) => void;
    checkStreak: () => void;
    buyOfflineCard: (cardId: string, cost: number, rateIncrease: number) => boolean;
    claimOfflinePoints: () => number; // Returns points earned
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

            consumeEnergy: () => {
                const { energy } = get();
                if (energy > 0) {
                    // P0-01 & P2-ENERGY-DESYNC FIX: Optimistic UI update only. Server handles real decrement.
                    set((state) => ({ energy: state.energy - 1 }));
                    return true;
                }
                return false;
            },

            buyEnergyWithGold: (amount, baseCost) => {
                const state = get();
                const actualCost = baseCost * Math.pow(2, state.dailyEnergyRefills);

                if (state.gold >= actualCost) {
                    set({
                        gold: state.gold - actualCost,
                        energy: Math.min(10, state.energy + amount),
                        lastEnergyUpdate: Date.now(),
                        dailyEnergyRefills: state.dailyEnergyRefills + 1
                    });
                    return true;
                }
                return false;
            },

            // P2-ENERGY-DESYNC FIX: Removed local calculateEnergyRefill logic.
            // Client relies entirely on `/api/v1/auth/sync` and UI will just show the server value.
            calculateEnergyRefill: () => { },

            refillEnergy: () => set({ energy: 10, lastEnergyUpdate: Date.now() }),

            checkStreak: () => {
                // P0-04 FIX: Read-only check first, then atomic set()
                const { lastLoginDate, lastStreakClaimDate, currentStreak } = get();
                const now = new Date();
                const today = now.toISOString().split('T')[0];

                // If already claimed today, do nothing
                if (lastStreakClaimDate === today) return;

                let newStreak = currentStreak;

                if (lastLoginDate) {
                    const lastDate = new Date(lastLoginDate);
                    lastDate.setHours(0, 0, 0, 0);
                    const todayDate = new Date(now);
                    todayDate.setHours(0, 0, 0, 0);

                    const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

                    if (diffDays === 1) {
                        newStreak += 1;
                    } else if (diffDays > 1) {
                        newStreak = 1;
                    }
                } else {
                    newStreak = 1;
                }

                const streakMultiplier = Math.min(newStreak, 30);
                let bonusPoints = 100 * streakMultiplier;
                let bonusGold = 2 * streakMultiplier;

                if (newStreak === 7) { bonusPoints += 5000; bonusGold += 100; }
                else if (newStreak === 14) { bonusPoints += 15000; bonusGold += 500; }
                else if (newStreak === 30) { bonusPoints += 50000; bonusGold += 2000; }
                else if (newStreak === 60) { bonusPoints += 150000; bonusGold += 5000; }
                else if (newStreak === 90) { bonusPoints += 500000; bonusGold += 15000; }

                // P0-04 FIX: Atomic updater — uses fresh state.points/state.gold
                set((state) => ({
                    currentStreak: newStreak,
                    lastLoginDate: today,
                    lastStreakClaimDate: today,
                    points: state.points + bonusPoints,
                    gold: state.gold + bonusGold,
                    dailyAdsWatched: 0,
                    dailyEnergyRefills: 0,
                    dailyCombo: [],
                    dailyComboClaimed: false
                }));
            },

            buyOfflineCard: (cardId, cost, rateIncrease) => {
                const { points, offlineCards } = get();
                if (points >= cost && !offlineCards.includes(cardId)) {
                    set((state) => ({
                        points: state.points - cost,
                        offlinePointsRate: state.offlinePointsRate + rateIncrease,
                        offlineCards: [...state.offlineCards, cardId],
                        // Auto-claim any pending points before rate changes
                        lastOfflineClaim: Date.now()
                    }));
                    return true;
                }
                return false;
            },

            claimOfflinePoints: () => {
                // P0-03 FIX: Atomic updater to prevent concurrent state overwrites
                const { offlinePointsRate, lastOfflineClaim } = get();
                if (offlinePointsRate <= 0) return 0;

                const now = Date.now();
                const hoursElapsed = (now - lastOfflineClaim) / 3600000;
                const rewardHours = Math.min(hoursElapsed, 8);
                const earnedPoints = Math.floor(rewardHours * offlinePointsRate);

                if (earnedPoints > 0) {
                    set((state) => ({
                        points: state.points + earnedPoints,
                        lastOfflineClaim: now
                    }));
                }
                return earnedPoints;
            },

            mutate: (trait, pointsEarned, goldEarned, synergy) => set((state) => {
                const newGenome = [...state.genome];
                let newProgress = Math.round((state.progress + 11.11) * 100) / 100;
                let newLevel = state.level;

                const newAdsWatched = state.dailyAdsWatched + 1;

                if (newProgress >= 100) {
                    if (newAdsWatched >= 15) {
                        newLevel = state.level + 1;
                        newProgress = 0;

                        if (newLevel <= 10) {
                            const spriteIndex = newGenome.findIndex(t => t.layerId === 'master_sprite');
                            const newSprite = {
                                layerId: 'master_sprite',
                                traitId: `monster_lvl${newLevel}_v1`,
                                hex: trait.hex || (spriteIndex !== -1 ? newGenome[spriteIndex].hex : '#00ffcc')
                            };

                            if (spriteIndex !== -1) {
                                newGenome[spriteIndex] = newSprite;
                            } else {
                                newGenome.push(newSprite);
                            }
                        }
                    } else {
                        newProgress = 99.9;
                    }
                }

                if (trait.layerId) {
                    const existingIndex = newGenome.findIndex(t => t.layerId === trait.layerId);
                    if (existingIndex !== -1) {
                        newGenome[existingIndex] = { ...newGenome[existingIndex], ...trait } as Trait;
                    } else {
                        newGenome.push(trait as Trait);
                    }
                }

                const newCombo = [...state.dailyCombo];
                if (trait.traitId && !state.dailyComboClaimed && !newCombo.includes(trait.traitId)) {
                    newCombo.push(trait.traitId);
                }

                let comboBonus = 0;
                let comboClaimed = state.dailyComboClaimed;
                if (!comboClaimed && newCombo.length >= 3) {
                    comboBonus = 500;
                    comboClaimed = true;
                }

                return {
                    genome: newGenome,
                    mutations: state.mutations + 1,
                    dailyAdsWatched: newAdsWatched,
                    lastAdWatchTime: Date.now(),
                    progress: newProgress,
                    level: Math.min(newLevel, 10),
                    highestLevelReached: Math.max(state.highestLevelReached || 0, Math.min(newLevel, 10)),
                    points: state.points + pointsEarned + comboBonus,
                    gold: state.gold + goldEarned,
                    synergyScore: synergy,
                    dailyCombo: newCombo,
                    dailyComboClaimed: comboClaimed
                };
            }),

            syncState: (data) => set((state) => ({
                ...state,
                // Direct scalar mappings
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
                highestLevelReached: Math.max(data.virus?.level ?? 0, state.highestLevelReached),
            })),
        }),
        {
            name: 'advirus-game-storage',
        }
    )
);
