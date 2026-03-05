'use client';

export const dynamic = 'force-dynamic';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import VirusEngine from '@/components/VirusEngine';
import { useGameStore } from '@/store/gameStore';
import { triggerMonetagAuction, showRewardedAd, AdSession } from '@/lib/monetag';

export default function Home() {
  const {
    points, gold, energy, level, progress, synergyScore, genome,
    consumeEnergy, mutate, checkStreak, currentStreak, buyEnergyWithGold,
    dailyEnergyRefills, dailyCombo, dailyComboClaimed, swarmId,
    offlinePointsRate, offlineCards, buyOfflineCardServer, claimOfflinePoints,
    // P1-ECONOMY: addGold/refillEnergy removed — rewards must come from server verification
    dailyAdsWatched, lastAdWatchTime, lastEnergyUpdate, // P2-01 FIX: Subscribe to these via hook
    highestLevelReached, // P2-GETSTATE FIX: Subscribe via hook for Collection Gallery
    syncState // P9 FIX: Hydrate from server
  } = useGameStore();

  const [isMutating, setIsMutating] = useState(false);
  const isMutatingRef = useRef(false); // P0-02 FIX: Sync mutex ref prevents double-click race
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const [showEnergyModal, setShowEnergyModal] = useState(false);
  const [auctionSession, setAuctionSession] = useState<AdSession | null>(null);
  const [mutationStep, setMutationStep] = useState<'idle' | 'auction' | 'watching' | 'morphing'>('idle');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [swarmsData, setSwarmsData] = useState<any[]>([]);
  const [mySwarmData, setMySwarmData] = useState<any | null>(null);
  const [isSwarmsLoading, setIsSwarmsLoading] = useState(false);
  const [newSwarmName, setNewSwarmName] = useState('');

  // Offline earnings pop-up state
  const [offlineEarned, setOfflineEarned] = useState(0);

  // PHASE 8: 5-Tab Navigation & Splash Screen
  const [bootSequence, setBootSequence] = useState(true);
  const [currentTab, setCurrentTab] = useState<'habitat' | 'lab' | 'collection' | 'social' | 'profile'>('habitat');

  useEffect(() => {
    // P2-02 FIX: Only show splash screen once per session to avoid Dev Hot-Reload annoyance
    const hasBooted = sessionStorage.getItem('hasBooted');
    if (hasBooted && process.env.NODE_ENV === 'development') {
      setBootSequence(false);
      return;
    }

    // Simulate splash screen boot sequence
    const timer = setTimeout(() => {
      setBootSequence(false);
      sessionStorage.setItem('hasBooted', 'true');
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // P2-02 FIX: Memoize positions so they don't re-randomize on every render
  const cinematicParticles = useMemo(() =>
    [...Array(20)].map(() => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      rotation: `rotate(${Math.random() * 360}deg)`,
      duration: `${Math.random() * 1 + 0.5}s`
    })), []);

  useEffect(() => {
    // Background loops

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const initData = tg?.initData || "";

    if (initData) {
      // Try claiming streak and offline earnings on initial load
      const runInitialChecks = async () => {
        try {
          const streakRes = await checkStreak(initData);
          if (streakRes && (streakRes.bonusPoints > 0 || streakRes.bonusGold > 0)) {
            alert(`🔥 Dailies Claimed: +${streakRes.bonusPoints} PTS | 🟡 +${streakRes.bonusGold} Gold`);
          }

          // Anti-Cheat: Claim offline points via server endpoint
          const earnedOffline = await claimOfflinePoints(initData);
          if (earnedOffline > 0) {
            setOfflineEarned(earnedOffline);
          }
        } catch (e) {
          console.error(e);
        }
      };
      runInitialChecks();
    }

    // No manual energy calculation loop here; energy syncs from the server periodically via syncState

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    // P1-REFERRAL FIX: Use actual Telegram user ID when available
    const userId = tg?.initDataUnsafe?.user?.id?.toString() || "mock_user_123";
    const botLink = `https://t.me/AdVirusBot?start=ref_${userId}`;
    const text = encodeURIComponent("🧬 Help me mutate my Digi-Virus! Play AdVirus Evolution Lab and earn $ADVIRUS points!");
    const shareLink = `https://t.me/share/url?url=${botLink}&text=${text}`;

    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(shareLink);
    } else {
      // P2-01 FIX: Explicit fallback for web browsers
      window.open(shareLink, '_blank');
    }
  };

  // P9: State Hydration & Periodic Sync
  useEffect(() => {
    const hydrate = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      const initData = tg?.initData || "";

      try {
        const response = await fetch('/api/v1/auth/sync', {
          method: 'POST',
          headers: { 'X-TG-Init-Data': initData }
        });

        if (!response.ok) {
          console.warn(`Hydration failed with status ${response.status}`);
          return;
        }

        const result = await response.json();
        if (result.success) {
          syncState(result.data);
          console.log("MMO State Hydrated from DB");
        }
      } catch (e) {
        console.error("Hydration network error", e);
      }
    };

    hydrate();

    // Periodic Background Sync (Every 30s)
    const syncInterval = setInterval(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;
      const initData = tg?.initData || "";
      const state = useGameStore.getState();

      try {
        await fetch('/api/v1/auth/sync-state', {
          method: 'POST',
          headers: { 'X-TG-Init-Data': initData, 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
      } catch (e) {
        console.error("Sync failed", e);
      }
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [syncState]);

  // Fetch Leaderboard when switching to Social tab
  useEffect(() => {
    if (currentTab === 'social') {
      const fetchLeaderboard = async () => {
        setIsLeaderboardLoading(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tg = (window as any).Telegram?.WebApp;
          const initData = tg?.initData || "";

          const res = await fetch('/api/v1/game/leaderboard?sortBy=points&limit=50', {
            headers: { 'X-TG-Init-Data': initData }
          });
          const json = await res.json();
          if (json.success) {
            setLeaderboardData(json.data);
          }
        } catch (e) {
          console.error("Failed to fetch leaderboard", e);
        } finally {
          setIsLeaderboardLoading(false);
        }
      };

      const fetchSwarms = async () => {
        setIsSwarmsLoading(true);
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tg = (window as any).Telegram?.WebApp;
          const initData = tg?.initData || "";

          if (swarmId) {
            const resMy = await fetch(`/api/v1/game/swarm?swarmId=${swarmId}`, { headers: { 'X-TG-Init-Data': initData } });
            const jsonMy = await resMy.json();
            if (jsonMy.success) setMySwarmData(jsonMy.data);
          }

          const resAll = await fetch('/api/v1/game/swarm', { headers: { 'X-TG-Init-Data': initData } });
          const jsonAll = await resAll.json();
          if (jsonAll.success) setSwarmsData(jsonAll.data);

        } catch (e) {
          console.error("Failed to fetch swarms", e);
        } finally {
          setIsSwarmsLoading(false);
        }
      };

      fetchLeaderboard();
      fetchSwarms();
    }
  }, [currentTab, swarmId]);

  const handleCreateSwarm = async () => {
    if (!newSwarmName || newSwarmName.length < 3) return alert("Name too short");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const initData = tg?.initData || "";

    try {
      const res = await fetch('/api/v1/game/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
        body: JSON.stringify({ name: newSwarmName })
      });
      const data = await res.json();
      if (data.success) {
        alert("Swarm Created!");
        setNewSwarmName('');
        // We sync again to get updated points/gold/swarmId
        const syncRes = await fetch('/api/v1/auth/sync-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
          body: JSON.stringify({ lastLoginDate: new Date().toISOString().split('T')[0] })
        });
        const syncData = await syncRes.json();
        if (syncData.success) syncState(syncData.data);
      } else {
        alert(data.error || "Failed to create Swarm");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleJoinSwarm = async (targetSwarmId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const initData = tg?.initData || "";

    try {
      const res = await fetch('/api/v1/game/swarm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
        body: JSON.stringify({ swarmId: targetSwarmId, action: 'join' })
      });
      const data = await res.json();
      if (data.success) {
        alert("Joined Swarm!");
        // We sync again to get updated swarmId
        const syncRes = await fetch('/api/v1/auth/sync-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
          body: JSON.stringify({ lastLoginDate: new Date().toISOString().split('T')[0] })
        });
        const syncData = await syncRes.json();
        if (syncData.success) syncState(syncData.data);
      } else {
        alert(data.error || "Failed to join Swarm");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLeaveSwarm = async () => {
    if (!confirm("Are you sure you want to leave your Swarm?")) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    const initData = tg?.initData || "";

    try {
      const res = await fetch('/api/v1/game/swarm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
        body: JSON.stringify({ action: 'leave' })
      });
      const data = await res.json();
      if (data.success) {
        alert("Left Swarm!");
        setMySwarmData(null);
        // We sync again to get updated swarmId
        const syncRes = await fetch('/api/v1/auth/sync-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TG-Init-Data': initData },
          body: JSON.stringify({ lastLoginDate: new Date().toISOString().split('T')[0] })
        });
        const syncData = await syncRes.json();
        if (syncData.success) syncState(syncData.data);
      } else {
        alert(data.error || "Failed to leave Swarm");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMutateClick = async () => {
    // P0-02 FIX: Use ref-based mutex (synchronous check, immune to React batching)
    if (isMutatingRef.current) return;
    if (energy <= 0) {
      setShowEnergyModal(true);
      return;
    }

    isMutatingRef.current = true;
    setIsMutating(true);
    setMutationStep('auction');

    try {
      // 1. Trigger Auction
      const session = await triggerMonetagAuction();
      setAuctionSession(session);

      await new Promise(r => setTimeout(r, 2000)); // Show bidding visual

      // 2. Play Ad
      setMutationStep('watching');
      const adSuccess = await showRewardedAd(session.sessionId);

      if (!adSuccess) {
        throw new Error("Ad viewing failed");
      }

      // 3. Server-Side Mutation
      setMutationStep('morphing');

      // P0-01 FIX: Energy is now consumed AFTER server confirmation, not before

      // ANTI-CHEAT FIX #3: Request server-signed ad token before mutation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tgMutate = (window as any).Telegram?.WebApp;
      const initDataMutate = tgMutate?.initData || '';

      let adToken = null;
      try {
        const tokenRes = await fetch('/api/v1/game/request-ad-token', {
          headers: { 'X-TG-Init-Data': initDataMutate }
        });
        const tokenData = await tokenRes.json();
        if (tokenData.success) {
          adToken = tokenData.data.adToken;
        }
      } catch (e) {
        console.warn("Ad token request failed, falling back to session ID", e);
      }

      const response = await fetch('/api/v1/game/mutate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TG-Init-Data': initDataMutate,
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          adSessionId: session.sessionId,
          adToken: adToken
        })
      });

      const result = await response.json();

      if (result.success) {
        // SERVER-AUTHORITATIVE: Pass entire response to store
        const prevLevel = level;
        mutate(result.data);

        if ((result.data.newLevel ?? level) > prevLevel) {
          setIsLevelingUp(true);
        }

        if (result.data.goldEarned > 0) {
          alert(`🎉 JACKPOT! You found 🟡 ${result.data.goldEarned} Gold in the DNA!`);
        }
      } else {
        alert(`Mutation Failed: ${result.error.message || 'Unknown error'}`);
      }

    } catch (error) {
      console.error(error);
      alert("Something went wrong during mutation.");
    } finally {
      setIsMutating(false);
      isMutatingRef.current = false; // P0-02 FIX: Release mutex
      setMutationStep('idle');
      setAuctionSession(null);
    }
  };

  const handleBuyWithStars = async (itemId: string, amount: number, priceStars: number) => {
    try {
      const res = await fetch('/api/v1/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, amount, price: priceStars })
      });
      const data = await res.json();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tg = (window as any).Telegram?.WebApp;

      if (data.success && tg) {
        tg.openInvoice(data.invoiceLink, (status: string) => {
          if (status === 'paid') {
            // P0-01 FIX: DO NOT grant rewards client-side.
            // In Phase 9, this will trigger a polling action or WebSocket update
            // to fetch the updated balance AFTER the Telegram webhook fires on the server.
            alert(`Payment successful! Your ${amount} ${itemId} are currently being verified by the server. Verification usually takes 1-3 minutes.`);
          } else if (status === 'failed') {
            alert("Payment failed.");
          } else if (status === 'cancelled') {
            console.log("Payment cancelled.");
          }
        });
      } else if (data.success) {
        // Desktop fallback testing
        alert(`MOCK INVOICE GENERATED. When Phase 9 is complete, your ${amount} ${itemId} would be verified by the server before appearing in your balance.`);
      } else {
        alert("Failed to generate invoice.");
      }
    } catch (e) {
      console.error(e);
      alert("Error initiating purchase.");
    }
  };

  // --- RENDER ---
  if (bootSequence) {
    return (
      <main className="h-screen w-screen bg-black text-[#00ffcc] font-mono flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,204,0.1),transparent_50%)] animate-pulse"></div>
        <div className="w-32 h-32 border-4 border-[#00ffcc] border-t-transparent border-b-[#0088ff] rounded-full animate-[spin_1.5s_linear_infinite] mb-8 shadow-[0_0_30px_rgba(0,255,204,0.3)] flex items-center justify-center">
          <span className="text-4xl">🦠</span>
        </div>
        <h1 className="text-4xl font-black italic tracking-[0.3em] drop-shadow-[0_0_15px_rgba(0,255,204,0.8)] animate-pulse text-center">
          ADVIRUS<br />EVOLUTION<br />LAB
        </h1>
        <p className="text-[10px] text-[#00ffcc]/60 uppercase tracking-[0.5em] mt-8 font-bold animate-bounce">Initializing Evolution Engine...</p>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen bg-black text-[#00ffcc] font-mono selection:bg-[#00ffcc]/30 overflow-hidden relative flex flex-col">
      {/* Cyberpunk Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,204,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,204,0.05)_1px,transparent_1px)] bg-[size:30px_30px] z-0 opacity-50 pointer-events-none"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black z-0 pointer-events-none"></div>
      {/* Scanline Overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjEiIGZpbGw9InJnYmEoMCwgMjU1LCAyMDQsIDAuMSkiLz48L3N2Zz4=')] opacity-30 pointer-events-none z-50 mix-blend-overlay"></div>

      {/* =========== TAB: HABITAT (Main Game) =========== */}
      {/* Wrapped in display:none to keep VirusEngine PixiJS canvas alive when switching tabs */}
      <div className="flex-1 w-full h-full relative overflow-y-auto pb-24" style={{ display: currentTab === 'habitat' ? 'block' : 'none' }}>

        {/* HUD - Top Bar */}
        <nav className="sticky top-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-md border-b-2 border-[#00ffcc]/30 flex justify-between items-center z-[50] shadow-[0_4px_20px_rgba(0,255,204,0.15)] clip-path-[polygon(0_0,100%_0,100%_80%,95%_100%,0_100%)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 border-2 border-[#00ffcc] bg-[#00ffcc]/10 flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-[#00ffcc]/20 w-0 group-hover:w-full transition-all duration-300"></div>
              <span className="font-black text-2xl text-[#00ffcc] drop-shadow-[0_0_8px_rgba(0,255,204,0.8)]">V</span>
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00ffcc]"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#00ffcc]"></div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-[0.2em] uppercase leading-none text-[#ffffff] drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">DIGI-VIRUS</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-sm bg-[#00ffcc] animate-pulse"></span>
                <p className="text-[9px] text-[#00ffcc]/70 uppercase tracking-widest font-bold">LINK: ACTIVE</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 items-center z-10 w-full mb-3 mt-4">
            <div className="flex items-center gap-1.5 px-3 bg-white/5 border border-white/10 rounded-full py-1 w-fit mx-auto">
              <span className="text-[12px]">🔥</span>
              <span className="text-[10px] font-bold text-orange-400 font-mono tracking-widest">{currentStreak} DAY STREAK</span>
            </div>
            {currentStreak >= 90 && <div className="text-[9px] text-yellow-300 font-bold bg-yellow-900/50 px-3 py-1 rounded-sm border border-yellow-500/50 uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(234,179,8,0.3)]">👑 Centurion</div>}
            {currentStreak >= 60 && currentStreak < 90 && <div className="text-[9px] text-purple-300 font-bold bg-purple-900/50 px-3 py-1 rounded-sm border border-purple-500/50 uppercase tracking-[0.2em]">🌟 Veteran Aura</div>}
            {currentStreak >= 30 && currentStreak < 60 && <div className="text-[9px] text-[#00ffcc] font-bold bg-[#00ffcc]/10 px-3 py-1 rounded-sm border border-[#00ffcc]/30 uppercase tracking-[0.2em]">💎 Epic Drop</div>}
            {currentStreak >= 14 && currentStreak < 30 && <div className="text-[9px] text-white font-bold bg-white/10 px-3 py-1 rounded-sm border border-white/30 uppercase tracking-[0.2em]">🛡️ Steadfast</div>}
          </div>

          <div className="flex gap-2">
            <div className="text-right px-3 py-1.5 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
              <p className="text-[8px] text-yellow-600 uppercase font-black tracking-widest">Gold</p>
              <p className="text-sm font-black text-yellow-500 tabular-nums leading-none flex items-center gap-1">
                🟡 {gold.toLocaleString()}
              </p>
            </div>
            <div className="text-right px-3 py-1.5 bg-purple-400/10 border border-purple-400/20 rounded-xl cursor-pointer hover:bg-purple-400/20 active:scale-95 transition-all shadow-[0_0_10px_rgba(168,85,247,0.1)]" onClick={() => setCurrentTab('lab')}>
              <p className="text-[8px] text-purple-400 uppercase font-black tracking-widest flex justify-between items-center gap-2">
                <span>Points</span>
                <span className="text-[7px] bg-purple-500/50 text-white px-1 rounded-sm">SHOP</span>
              </p>
              <p className="text-sm font-black text-purple-300 tabular-nums leading-none">
                {points.toLocaleString()}
                {offlinePointsRate > 0 && <span className="text-[9px] text-purple-400/50 ml-1">+{offlinePointsRate}/h</span>}
              </p>
            </div>
          </div>
        </nav>

        <div className="pt-8 pb-32 px-6 max-w-lg mx-auto flex flex-col items-center gap-8 h-full relative z-10">
          {/* Stage & Progress */}
          <div className="w-full flex justify-between items-center mb-2">
            <div className="flex flex-col gap-1 w-full relative">
              <div className="flex justify-between items-baseline mb-2">
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#00ffcc] to-[#0088ff] drop-shadow-[0_0_10px_rgba(0,255,204,0.5)] italic tracking-tighter">
                  LVL: {level}
                </h2>
                <span className="text-xs font-black text-[#0088ff] px-2 py-1 bg-[#0088ff]/10 border border-[#0088ff]/30">SYNC: {currentStreak}D</span>
              </div>

              {/* 100% Progress Bar Digital */}
              <div className="w-full h-4 bg-black border-2 border-[#00ffcc]/30 relative overflow-hidden polygon-clip p-0.5">
                <div
                  className="h-full bg-[#00ffcc] transition-all duration-1000 ease-out relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(0,0,0,0.2)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.2)_50%,rgba(0,0,0,0.2)_75%,transparent_75%,transparent)] bg-[length:10px_10px] animate-[slide_1s_linear_infinite]"></div>
                </div>
              </div>
              <p className="text-[10px] text-[#00ffcc]/60 font-bold text-right mt-1 tracking-widest">DIGIVOLUTION: {Math.floor(progress)}%</p>
            </div>
          </div>

          {/* The Virus Engine / Mutation Overlay */}
          <section className="relative w-full aspect-square max-w-[340px] flex items-center justify-center">
            {/* Digital Aura Rings */}
            <div className="absolute -inset-10 border border-[#00ffcc]/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
            <div className="absolute -inset-14 border border-[#0088ff]/10 rounded-full animate-[spin_15s_linear_reverse_infinite] border-dashed"></div>

            {mutationStep === 'idle' && (
              <VirusEngine level={level} genome={genome} synergyScore={synergyScore} />
            )}

            {mutationStep === 'auction' && (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900/40 backdrop-blur-md rounded-[3rem] border-2 border-dashed border-white/20 animate-in fade-in zoom-in duration-300">
                <p className="text-xs font-black text-white/40 uppercase tracking-[0.5em] mb-4">RTB Auction Active</p>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-4xl font-black italic text-purple-500 animate-pulse">
                    {auctionSession?.brand || 'BIDDING...'}
                  </div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Highest Bidder Wins DNA Slot</p>
                </div>
              </div>
            )}

            {mutationStep === 'watching' && (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-xl font-black italic animate-pulse">EXTRACTING DNA...</p>
              </div>
            )}

            {mutationStep === 'morphing' && (
              <div className="flex flex-col items-center animate-bounce">
                <p className="text-4xl font-black text-pink-500 italic">MUTATING!</p>
              </div>
            )}

            {/* Energy Refill Modal Overlay */}
            {showEnergyModal && (
              <div className="absolute inset-[-40px] z-50 bg-black/80 backdrop-blur-xl rounded-[4rem] border border-yellow-500/30 flex flex-col items-center justify-center p-6 text-center shadow-[0_0_100px_rgba(234,179,8,0.2)] animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mb-4 border border-yellow-400/50">
                  <span className="text-3xl">🔋</span>
                </div>
                <h3 className="text-xl font-black text-white italic mb-2">ENERGY DEPLETED</h3>
                <p className="text-xs text-gray-400 mb-6 w-4/5 mx-auto">
                  Your Molecular Energy is at 0. You can wait 2 hours for a free refill, or buy a full tank instantly.
                </p>

                <button
                  onClick={async () => {
                    // P1-01 FIX: Server-authoritative energy purchase
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const tg = (window as any).Telegram?.WebApp;
                    const initData = tg?.initData || "";
                    const result = await buyEnergyWithGold(initData);
                    if (result.success) {
                      setShowEnergyModal(false);
                      alert(`⚡ Energy refilled! Cost: 🟡 ${result.costPaid} Gold. Next refill: 🟡 ${result.nextCost}`);
                    } else {
                      alert(result.error || 'Failed to buy energy');
                    }
                  }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-600 to-yellow-500 text-black font-black text-sm uppercase tracking-widest mb-3 hover:scale-105 transition-transform active:scale-95 shadow-lg shadow-yellow-500/20 tabular-nums"
                >
                  Buy Refill (🟡 {50 * Math.pow(2, dailyEnergyRefills)})
                </button>

                <button
                  onClick={() => setShowEnergyModal(false)}
                  className="w-full py-4 rounded-2xl bg-white/5 text-gray-400 font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Offline Earnings Modal Overlay */}
            {offlineEarned > 0 && (
              <div className="absolute inset-[-40px] z-[60] bg-black/80 backdrop-blur-xl rounded-[4rem] border border-purple-500/30 flex flex-col items-center justify-center p-6 text-center shadow-[0_0_100px_rgba(168,85,247,0.2)] animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-purple-900/40 rounded-full flex items-center justify-center mb-4 border-2 border-purple-500/50 relative overflow-hidden">
                  <div className="absolute inset-0 bg-purple-500/20 animate-pulse"></div>
                  <span className="text-4xl relative z-10 drop-shadow-[0_0_10px_rgba(168,85,247,1)]">💤</span>
                </div>
                <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 italic mb-2 tracking-widest uppercase">Virus Mutated<br />While Sleeping</h3>
                <p className="text-sm font-bold text-gray-300 mb-6 px-4">
                  Your offline mining rigs successfully harvested <span className="text-purple-400">+{offlineEarned.toLocaleString()}</span> points.
                </p>

                <button
                  onClick={() => setOfflineEarned(0)}
                  className="w-full py-4 rounded-3xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-105 active:scale-95 transition-all"
                >
                  Collect Points
                </button>
              </div>
            )}

            {/* Cinematic Level Up Overlay */}
            {isLevelingUp && (
              <div className="fixed inset-0 z-[100] bg-black backdrop-blur-3xl flex flex-col items-center justify-center animate-in fade-in duration-1000">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,255,204,0.15),transparent_60%)] animate-pulse"></div>

                <div className="z-10 flex flex-col items-center animate-in slide-in-from-bottom-20 zoom-in-50 duration-700 w-full px-6 text-center">
                  <h1 className="text-6xl text-center font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-[#00ffcc] to-[#0088ff] italic tracking-tighter drop-shadow-[0_0_20px_rgba(0,255,204,0.8)] px-4">
                    EVOLUTION<br />COMPLETE
                  </h1>

                  <div className="mt-12 mb-8 text-3xl font-black text-white px-8 py-3 bg-[#00ffcc]/10 border-y-4 border-[#00ffcc] shadow-[0_0_50px_rgba(0,255,204,0.3)] animate-bounce tracking-widest uppercase">
                    STAGE {level} REACHED
                  </div>

                  <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
                    <button
                      onClick={handleInvite}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 text-white font-black text-lg uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-[0_0_20px_rgba(59,130,246,0.5)] flex items-center justify-center gap-3"
                    >
                      <span className="text-2xl">✈️</span> Flex on Telegram
                    </button>

                    <button
                      onClick={() => setIsLevelingUp(false)}
                      className="w-full py-3 rounded-xl bg-white/10 text-white font-bold text-sm uppercase tracking-widest hover:bg-white/20 transition-colors border border-white/20"
                    >
                      Continue
                    </button>
                  </div>
                </div>

                {/* P2-02 FIX: Use memoized particles instead of Math.random() in render */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-50">
                  {cinematicParticles.map((p, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-32 bg-gradient-to-b from-[#00ffcc] to-transparent"
                      style={{
                        left: p.left,
                        top: p.top,
                        transform: p.rotation,
                        animation: `pulse ${p.duration} infinite`
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

          </section>

          {/* Controls */}
          <section className="w-full flex flex-col gap-6">

            {/* Daily Combo Widget */}
            <div className="flex flex-col gap-2 p-3 bg-[#00ffcc]/5 border border-[#00ffcc]/20 rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-center mb-1 z-10">
                <span className="text-[10px] font-black text-[#00ffcc] uppercase tracking-widest flex items-center gap-2 drop-shadow-[0_0_5px_rgba(0,255,204,0.5)]">
                  <span className="text-sm border border-[#00ffcc]/50 rounded-full px-1">🎯</span> DAILY COMBO
                </span>
                <span className="text-[10px] text-[#00ffcc]/60 font-bold uppercase tracking-widest bg-[#00ffcc]/10 px-2 py-0.5 rounded">500 PTS</span>
              </div>
              <div className="flex gap-2 h-10 z-10">
                {[0, 1, 2].map((i) => {
                  const hasTrait = dailyCombo[i];
                  return (
                    <div key={i} className={`flex-1 flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-500 ${hasTrait ? 'bg-[linear-gradient(45deg,rgba(0,255,204,0.2),transparent)] border-[#00ffcc] shadow-[0_0_15px_rgba(0,255,204,0.3)]' : 'bg-black/50 border-white/5'}`}>
                      {hasTrait ? (
                        <span className="text-[9px] text-white font-black uppercase tracking-tighter truncate w-full text-center px-1">
                          {hasTrait.split('_')[1] || 'DNA'}
                        </span>
                      ) : (
                        <span className="text-white/10 text-lg font-light">?</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Overlay if claimed */}
              {dailyComboClaimed && (
                <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-500">
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(234,179,8,0.2),transparent)] animate-[slide_2s_ease-in-out_infinite]"></div>
                  <span className="text-xl font-black text-yellow-500 tracking-[0.4em] uppercase drop-shadow-[0_0_10px_rgba(234,179,8,0.8)] z-10 transition-transform hover:scale-105">
                    CLAIMED
                  </span>
                </div>
              )}
            </div>

            {/* Molecular Energy */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-end px-1">
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-2">
                  <span>Molecular Energy</span>
                  <span className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded text-white/50 border border-white/10">Ads Today: <span className={dailyAdsWatched >= 15 ? 'text-[#00ffcc]' : 'text-orange-400'}>{dailyAdsWatched}</span>/50</span>
                </p>
                <p className="text-xs font-black text-purple-400 italic">{energy}/10</p>
              </div>
              <div className="flex gap-1.5 h-3">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm transition-all duration-500 ${i < energy ? 'bg-gradient-to-b from-purple-400 to-purple-600 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 border border-white/5'}`}
                  />
                ))}
              </div>
              <div className="flex justify-between w-full mt-1 px-1">
                <p className="text-[8px] text-gray-600 font-bold uppercase">{dailyAdsWatched < 15 ? <span className="text-orange-400">* {15 - dailyAdsWatched} more required for evolution</span> : <span className="text-[#00ffcc]">✓ Evolution Unlocked</span>}</p>
                <p className="text-[8px] text-gray-600 font-bold uppercase">
                  {/* P2-05 FIX: Dynamic refill timer */}
                  {energy >= 10 ? 'Full' : (() => {
                    const elapsed = Date.now() - lastEnergyUpdate;
                    const remaining = Math.max(0, 2 * 60 * 60 * 1000 - (elapsed % (2 * 60 * 60 * 1000)));
                    const mins = Math.floor(remaining / 60000);
                    const secs = Math.floor((remaining % 60000) / 1000);
                    return `Refill in ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                  })()}
                </p>
              </div>
            </div>

            {(() => {
              const cooldownMs = 15 * 60 * 1000; // 15 mins
              const timeSinceLastAd = Date.now() - lastAdWatchTime;
              const isOnCooldown = timeSinceLastAd < cooldownMs;
              const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastAd) / 60000);

              if (dailyAdsWatched >= 50) {
                return (
                  <button disabled className="group relative w-full h-24 border-2 border-gray-500/50 bg-gray-900/50 opacity-50 cursor-not-allowed clip-path-[polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]">
                    <span className="relative z-10 text-xl font-black tracking-widest italic uppercase flex items-center justify-center h-full text-gray-500">
                      DAILY CAP REACHED (50/50)
                    </span>
                  </button>
                );
              }
              if (isOnCooldown && dailyAdsWatched > 0) {
                return (
                  <button disabled className="group relative w-full h-24 border-2 border-orange-500/50 bg-orange-900/30 cursor-not-allowed clip-path-[polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]">
                    <span className="relative z-10 text-xl font-black tracking-widest italic uppercase flex flex-col items-center justify-center h-full text-orange-400 text-center leading-none">
                      <span>COOLDOWN</span>
                      <span className="text-sm mt-1">{remainingMinutes} MINS LEFT</span>
                    </span>
                  </button>
                );
              }

              return (
                <button
                  onClick={handleMutateClick}
                  disabled={isMutating || energy === 0}
                  className={`group relative w-full h-24 border-2 overflow-hidden transition-all duration-300 clip-path-[polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]
                  ${energy > 0 && !isMutating
                      ? 'border-[#00ffcc] hover:scale-[1.02] active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(0,255,204,0.3)]'
                      : 'border-red-500/50 grayscale-0 opacity-80 cursor-not-allowed bg-red-900/20'
                    }
                `}
                >
                  {energy > 0 && !isMutating && (
                    <>
                      <div className="absolute inset-0 bg-[#00ffcc] opacity-10 group-hover:opacity-30 transition-opacity"></div>
                      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(0,255,204,0.1)_25%,transparent_25%,transparent_50%,rgba(0,255,204,0.1)_50%,rgba(0,255,204,0.1)_75%,transparent_75%,transparent)] bg-[length:10px_10px] animate-[slide_1s_linear_infinite]"></div>
                    </>
                  )}
                  <span className={`relative z-10 text-3xl font-black tracking-widest italic uppercase flex items-center justify-center h-full drop-shadow-lg ${energy > 0 ? 'text-[#00ffcc]' : 'text-red-500'}`}>
                    {isMutating ? 'DATA TRANSFER...' : (energy === 0 ? 'SYSTEM HALT' : 'INIT DIGIVOLVE')}
                  </span>
                </button>
              );
            })()}
          </section>


          {/* Activity Feed */}
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full w-1 bg-purple-500"></div>
            <p className="text-[8px] text-purple-500 font-black uppercase tracking-[0.3em] mb-2 opacity-60 flex items-center gap-2">
              Live Mutation Feed
            </p>
            <div className="space-y-1">
              <p className="text-[10px] text-gray-400">@User772 found <span className="text-yellow-400 font-bold">Shopee Core</span> [Legendary]</p>
              <p className="text-[10px] text-gray-400 opacity-40">@AdViruz99 mutated Stage 2 → Juvenile</p>
            </div>
          </div>

          {/* DEBUG: Background Variations */}
          <div className="w-full flex flex-wrap justify-center gap-1.5 mt-4 text-center max-w-2xl mx-auto">
            {[
              'bg_digital_void', 'bg_biohazard_lab', 'bg_cosmic_nebula',
              'bg_cyber_city', 'bg_frozen_data', 'bg_molten_core', 'bg_glitch_server', 'bg_zen_bridge',
              'bg_deep_sea', 'bg_float_island', 'bg_solar_flare', 'bg_obsidian_monolith', 'bg_aurora_portal',
              'bg_crystal_cave', 'bg_neon_forest', 'bg_storm_clouds', 'bg_clockwork_void', 'bg_toxic_marsh',
              'bg_cyber_graveyard', 'bg_data_cathedral', 'bg_glitch_desert', 'bg_circuit_city', 'bg_virtual_library', 'bg_space_hub'
            ].map((bgId) => {
              const displayName = bgId.replace('bg_', '').split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
              const shortName = bgId.replace('bg_', '').split('_').map(w => w[0].toUpperCase()).join('');

              return (
                <button
                  key={bgId}
                  title={displayName}
                  onClick={() => {
                    const { genome } = useGameStore.getState();
                    const newGenome = genome.map(t => t.layerId === 'background_layer' ? { ...t, traitId: bgId } : t);
                    useGameStore.setState({ genome: newGenome });
                  }}
                  className={`py-1 px-2 rounded text-[8px] font-bold border transition-all uppercase tracking-wider ${genome.find(t => t.layerId === 'background_layer')?.traitId === bgId ? 'bg-[#00ffcc] border-[#00ffcc] text-black shadow-[0_0_10px_rgba(0,255,204,0.4)]' : 'border-[#00ffcc]/30 text-[#00ffcc] hover:bg-[#00ffcc]/20'}`}
                >
                  {shortName === 'DV' ? 'VOID' : (shortName === 'BL' ? 'LAB' : (shortName === 'CN' ? 'NEB' : shortName))}
                </button>
              );
            })}
          </div>

          {/* DEBUG: Evolution Preview (Linear System) */}
          <div className="w-full grid grid-cols-5 gap-2 mt-4 text-center">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(s => (
              <button
                key={s}
                onClick={() => {
                  const currentBg = useGameStore.getState().genome.find(t => t.layerId === 'background_layer')?.traitId || 'bg_digital_void';
                  const demoGenome = [
                    { layerId: "background_layer", traitId: currentBg, hex: "#000000" },
                    { layerId: "master_sprite", traitId: `monster_lvl${s}_v1`, hex: "#ffffff" },
                    { layerId: "fx_layer", traitId: "fx_none", hex: "#ffffff" }
                  ];
                  useGameStore.setState({ level: s, genome: demoGenome, progress: 0 });
                }}
                className={`py-2 rounded-lg text-[10px] font-black border transition-all ${level === s ? 'bg-[#00ffcc] border-[#00ffcc] text-black shadow-[0_0_15px_rgba(0,255,204,0.5)]' : 'bg-white/5 border-white/10 text-white/40'}`}
              >
                LVL {s}
              </button>
            ))}
          </div>
          <p className="text-[8px] text-center text-[#00ffcc]/60 mt-2 uppercase tracking-widest font-bold">SYSTEM OVERRIDE: CLICK TO PREVIEW LINEAR STAGES</p>
        </div> {/* End pt-8 pb-32 content wrapper */}
      </div> {/* End Habitat Tab Container */}

      {/* =========== TAB: LAB (Upgrades & Shop) =========== */}
      {currentTab === 'lab' && (
        <div className="flex-1 w-full h-full relative overflow-y-auto pb-24 z-10 p-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 border-2 border-purple-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
            <span className="text-3xl">🧬</span>
          </div>
          <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-[#00ffcc] mb-2 uppercase text-center">Evolution Lab</h2>
          <p className="text-xs text-gray-400 text-center mb-8 uppercase tracking-widest max-w-[250px]">Upgrade your virus strain using collected Data Points & Gold.</p>

          <div className="w-full bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col gap-3">
            <h3 className="text-[10px] text-gray-400 font-bold uppercase tracking-widest border-b border-white/10 pb-2 mb-2">Black Market / Premium</h3>

            <button
              onClick={() => handleBuyWithStars('Gold', 1000, 50)}
              className="w-full relative overflow-hidden group border border-yellow-500/50 bg-yellow-900/20 rounded-xl p-3 flex justify-between items-center transition-all hover:bg-yellow-900/40 hover:border-yellow-400 active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 relative z-10">
                <span className="text-2xl drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]">🟡</span>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-black text-yellow-500 uppercase tracking-widest leading-none mb-1">1,000 Gold</span>
                  <span className="text-[9px] text-yellow-300/70 font-bold uppercase tracking-widest">Premium Currency</span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-[#1e88e5] px-3 py-1.5 rounded-lg border border-[#3b82f6] relative z-10 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                <span className="text-sm">⭐️</span>
                <span className="text-[10px] font-black text-white">50</span>
              </div>
            </button>

            <button
              onClick={() => handleBuyWithStars('Energy', 10, 25)}
              className="w-full relative overflow-hidden group border border-[#00ffcc]/50 bg-[#00ffcc]/10 rounded-xl p-3 flex justify-between items-center transition-all hover:bg-[#00ffcc]/20 hover:border-[#00ffcc] active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 relative z-10">
                <span className="text-2xl drop-shadow-[0_0_5px_rgba(0,255,204,0.8)]">🔋</span>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-black text-[#00ffcc] uppercase tracking-widest leading-none mb-1">Full Energy Refill</span>
                  <span className="text-[9px] text-[#00ffcc]/60 font-bold uppercase tracking-widest">Instantly max out energy</span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-[#1e88e5] px-3 py-1.5 rounded-lg border border-[#3b82f6] relative z-10 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                <span className="text-sm">⭐️</span>
                <span className="text-[10px] font-black text-white">25</span>
              </div>
            </button>
          </div>

          <div className="w-full bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center justify-center h-24 mt-4">
            <span className="text-2xl mb-1">💳</span>
            <p className="font-bold text-gray-500 uppercase tracking-widest text-[9px] text-center">In-App Purchases processed<br />via Telegram Stars</p>
          </div>
        </div>
      )}

      {/* =========== TAB: COLLECTION =========== */}
      {currentTab === 'collection' && (
        <div className="flex-1 w-full h-full relative overflow-y-auto pb-24 z-10 p-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 border-2 border-[#0088ff] rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(0,136,255,0.4)]">
            <span className="text-3xl">📚</span>
          </div>
          <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#0088ff] to-[#00ffcc] mb-2 uppercase text-center">Genome Registry</h2>
          <p className="text-xs text-gray-400 text-center mb-8 uppercase tracking-widest max-w-[250px]">Review discovered mutations and lore.</p>

          <div className="w-full grid grid-cols-2 gap-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((stage) => {
              const isUnlocked = stage <= (highestLevelReached || 0);

              return (
                <div
                  key={stage}
                  className={`relative overflow-hidden aspect-[3/4] rounded-2xl border-2 flex flex-col items-center justify-center p-4 transition-all ${isUnlocked
                    ? 'bg-[#0088ff]/10 border-[#0088ff]/50 shadow-[0_0_15px_rgba(0,136,255,0.2)]'
                    : 'bg-white/5 border-white/10 opacity-70 grayscale'
                    }`}
                >
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[9px] font-bold text-white tracking-widest border border-white/10">
                    STAGE {stage}
                  </div>

                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform ${isUnlocked ? 'scale-110 bg-[#00ffcc]/20 border border-[#00ffcc]/50 shadow-[0_0_20px_rgba(0,255,204,0.4)]' : 'bg-black/50 border border-white/5'}`}>
                    <span className="text-4xl drop-shadow-lg filter">{isUnlocked ? '🦠' : '❓'}</span>
                  </div>

                  <h3 className={`text-sm font-black text-center uppercase tracking-widest leading-tight ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>
                    {isUnlocked ? `Subject_V${stage}` : `Unknown`}
                  </h3>

                  {!isUnlocked && (
                    <p className="text-[8px] text-gray-600 mt-2 font-bold uppercase tracking-widest text-center">Requires Evolution</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========== TAB: LAB (Offline Earning Upgrades) =========== */}
      {currentTab === 'lab' && (
        <div className="flex-1 w-full h-full relative overflow-y-auto pb-24 z-10 p-6 flex flex-col animate-in fade-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 border-2 border-pink-500 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(236,72,153,0.4)]">
              <span className="text-3xl">🧬</span>
            </div>
            <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 uppercase text-center">The Lab</h2>
            <p className="text-xs text-gray-400 text-center uppercase tracking-widest mt-2">Idle Earning Upgrades</p>
          </div>

          <div className="w-full bg-purple-900/20 border border-purple-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-purple-400 uppercase font-black tracking-widest">Current Rate</span>
              <span className="text-2xl font-black text-purple-300">{offlinePointsRate} <span className="text-xs">PTS/HR</span></span>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center border border-purple-500/50 animate-pulse">
              <span className="text-xl">⚙️</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[
              { id: 'card_basic_mining', name: 'Basic Mining Rig', cost: 1000, rateIncrease: 50, icon: '🖥️' },
              { id: 'card_advanced_ai', name: 'Advanced AI Trader', cost: 5000, rateIncrease: 300, icon: '🧠' },
              { id: 'card_quantum_processor', name: 'Quantum Processor', cost: 25000, rateIncrease: 2000, icon: '⚛️' },
              { id: 'card_dark_matter', name: 'Dark Matter Harvester', cost: 100000, rateIncrease: 10000, icon: '🌌' }
            ].map(card => {
              const owned = offlineCards.includes(card.id);
              const affordable = points >= card.cost;
              return (
                <div key={card.id} className={`w-full border rounded-2xl p-4 flex flex-col gap-3 transition-all ${owned ? 'bg-black/80 border-gray-600 opacity-50' : 'bg-black/60 border-pink-500/30 hover:border-pink-500/60'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center text-xl border border-pink-500/20">
                        {card.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-white uppercase tracking-wider">{card.name}</span>
                        <span className="text-[10px] uppercase text-[#00ffcc] tracking-widest">+{card.rateIncrease} PTS/HR</span>
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={owned}
                    onClick={async () => {
                      if (!affordable && !owned) {
                        alert("Not enough Points!");
                        return;
                      }
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const tg = (window as any).Telegram?.WebApp;
                      const initData = tg?.initData || "";
                      const success = await buyOfflineCardServer(card.id, initData);
                      if (success) {
                        alert(`Purchased ${card.name}! Your idle rate increased by ${card.rateIncrease}/hr.`);
                      } else {
                        alert("Failed to purchase card.");
                      }
                    }}
                    className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest ${owned
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : affordable
                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:scale-[1.02] active:scale-95 transition-transform'
                        : 'bg-red-900/50 text-red-300 border border-red-500/50 cursor-not-allowed'
                      }`}
                  >
                    {owned ? 'Owned' : affordable ? `Buy (${card.cost} PTS)` : `Need ${card.cost} PTS`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========== TAB: SOCIAL (Leaderboard & Swarms) =========== */}
      {currentTab === 'social' && (
        <div className="flex-1 w-full h-full relative overflow-y-auto pb-24 z-10 p-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 border-2 border-yellow-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(234,179,8,0.4)]">
            <span className="text-3xl">🏆</span>
          </div>
          <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-orange-500 mb-2 uppercase text-center">Global Rankings</h2>
          <p className="text-xs text-gray-400 text-center mb-8 uppercase tracking-widest max-w-[250px]">Top Digivolution Strains Worldwide</p>

          <div className="w-full flex flex-col gap-4">

            {/* LEADERBOARD WIDGET */}
            <div className="w-full bg-black/60 border border-yellow-500/30 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_15px_rgba(234,179,8,0.1)]">
              <div className="grid grid-cols-12 gap-2 p-3 bg-yellow-500/10 border-b border-yellow-500/30 text-[9px] font-black tracking-widest uppercase text-yellow-500">
                <div className="col-span-2 text-center">Rnk</div>
                <div className="col-span-4 text-left">Player</div>
                <div className="col-span-2 text-right">Lvl</div>
                <div className="col-span-4 text-right">Points</div>
              </div>

              <div className="flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar">
                {isLeaderboardLoading ? (
                  <div className="p-8 flex justify-center">
                    <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : leaderboardData.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-500 font-mono uppercase tracking-widest">
                    No data accessible
                  </div>
                ) : (
                  leaderboardData.map((player) => (
                    <div key={player.id} className={`grid grid-cols-12 gap-2 p-3 items-center border-b border-white/5 transition-colors ${player.rank === 1 ? 'bg-yellow-500/20' : 'hover:bg-white/5'}`}>
                      <div className="col-span-2 text-center">
                        <span className={`text-sm font-black ${player.rank === 1 ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]' : player.rank === 2 ? 'text-gray-300' : player.rank === 3 ? 'text-orange-400' : 'text-gray-500'}`}>
                          #{player.rank}
                        </span>
                      </div>
                      <div className="col-span-4 text-left truncate">
                        <span className={`text-[10px] font-bold ${player.rank <= 3 ? 'text-white' : 'text-gray-400'}`}>
                          {player.displayName}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-xs font-black text-[#00ffcc]">{player.level}</span>
                      </div>
                      <div className="col-span-4 text-right truncate">
                        <span className="text-[10px] font-mono text-purple-400">{player.points.toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Viral Metagame - Referral Button */}
            <button
              onClick={handleInvite}
              className="w-full relative overflow-hidden group border border-pink-500/50 bg-pink-900/20 rounded-2xl p-4 flex justify-between items-center transition-all hover:bg-pink-900/40 hover:border-pink-400 active:scale-[0.98] shadow-[0_0_15px_rgba(236,72,153,0.1)] mt-2"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(236,72,153,0.1)_50%,transparent_75%)] bg-[length:20px_20px] animate-[slide_1s_linear_infinite]"></div>
              <div className="flex items-center gap-4 relative z-10">
                <span className="text-3xl drop-shadow-[0_0_5px_rgba(236,72,153,0.8)]">🦠</span>
                <div className="flex flex-col text-left">
                  <span className="font-black text-pink-400 uppercase tracking-widest leading-none mb-1">Infect a Friend</span>
                  <span className="text-[10px] text-pink-300/70 font-bold uppercase tracking-widest">Share link via DM</span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-pink-500/20 px-3 py-1.5 rounded-lg border border-pink-500/30 relative z-10">
                <span className="text-xs font-black text-pink-300">+50k PTS</span>
              </div>
            </button>

            {/* SWARM ALLIANCES */}
            <h2 className="text-xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 mt-6 uppercase text-center border-t border-white/10 pt-4">Swarm Alliances</h2>

            {mySwarmData ? (
              <div className="w-full bg-black/60 border border-red-500/30 rounded-2xl p-4 flex flex-col items-center">
                <span className="text-4xl mb-2">🔥</span>
                <h3 className="text-xl font-bold text-red-500 uppercase">{mySwarmData.name}</h3>
                <p className="text-xs text-gray-400 mb-4">{mySwarmData._count?.members || mySwarmData.members?.length || 0} Members | {Math.floor(mySwarmData.totalSynergy * 100)} Synergy</p>
                <button onClick={handleLeaveSwarm} className="text-xs text-red-400 uppercase tracking-widest font-bold border border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-500/20">Leave Swarm</button>

                <div className="w-full mt-4 flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scrollbar border-t border-white/10 pt-2">
                  {mySwarmData.members?.map((m: any) => (
                    <div key={m.id} className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                      <span className="text-xs font-bold text-white max-w-[120px] truncate">{m.telegramId}</span>
                      <span className="text-xs font-mono text-[#00ffcc]">Lv.{m.highestLevelReached}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-between gap-2">
                <input
                  type="text"
                  placeholder="Swarm Name"
                  value={newSwarmName}
                  onChange={(e) => setNewSwarmName(e.target.value)}
                  className="flex-1 bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
                <button onClick={handleCreateSwarm} className="bg-red-600 text-white font-bold uppercase text-xs px-4 py-2 rounded-xl hover:bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.4)]">
                  Create (500G)
                </button>
              </div>
            )}

            {!mySwarmData && (
              <div className="w-full bg-black/60 border border-white/10 rounded-2xl overflow-hidden mt-4">
                <div className="grid grid-cols-12 gap-2 p-3 bg-white/5 border-b border-white/10 text-[9px] font-black tracking-widest uppercase text-gray-400">
                  <div className="col-span-5 text-left">Swarm</div>
                  <div className="col-span-3 text-center">Members</div>
                  <div className="col-span-4 text-right">Action</div>
                </div>
                <div className="flex flex-col max-h-[200px] overflow-y-auto">
                  {isSwarmsLoading ? (
                    <div className="p-4 text-center">Loading...</div>
                  ) : swarmsData.map((swarm) => (
                    <div key={swarm.id} className="grid grid-cols-12 gap-2 p-3 items-center border-b border-white/5">
                      <div className="col-span-5 text-left truncate"><span className="text-[10px] font-bold text-white">{swarm.name}</span></div>
                      <div className="col-span-3 text-center"><span className="text-xs font-mono text-gray-400">{swarm._count?.members || 0}</span></div>
                      <div className="col-span-4 text-right">
                        <button onClick={() => handleJoinSwarm(swarm.id)} className="bg-white/10 hover:bg-white/20 text-white text-[9px] font-bold uppercase px-3 py-1 rounded">Join</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* =========== TAB: PROFILE =========== */}
      {currentTab === 'profile' && (
        <div className="flex-1 w-full h-full relative overflow-y-auto pb-24 z-10 p-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 border-2 border-orange-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(249,115,22,0.4)]">
            <span className="text-3xl">👤</span>
          </div>
          <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-[#00ffcc] mb-2 uppercase text-center">Host Data</h2>
          <p className="text-xs text-gray-400 text-center mb-8 uppercase tracking-widest max-w-[250px]">Player statistics and secure connection logs.</p>

          <div className="w-full bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center justify-center h-40">
            <span className="text-4xl mb-2">🚧</span>
            <p className="font-bold text-gray-500 uppercase tracking-widest text-[10px]">Data Encrypted...</p>
          </div>
        </div>
      )}

      {/* =========== 5-TAB BOTTOM NAVIGATION =========== */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 bg-black/95 backdrop-blur-xl border-t border-[#00ffcc]/20 flex justify-around items-center px-1 z-[60] pb-safe">
        {[
          { id: 'habitat', icon: '🦠', label: 'Habitat' },
          { id: 'lab', icon: '🧬', label: 'Lab' },
          { id: 'collection', icon: '📚', label: 'Registry' },
          { id: 'social', icon: '🌐', label: 'Social' },
          { id: 'profile', icon: '👤', label: 'Profile' }
        ].map(tab => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as any)}
              className={`flex flex-col items-center justify-center w-full h-full pt-2 pb-1 gap-1.5 transition-all relative ${isActive ? 'text-[#00ffcc]' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {isActive && <div className="absolute top-0 w-1/2 h-0.5 bg-[#00ffcc] shadow-[0_0_10px_#00ffcc]"></div>}
              <span className={`text-[22px] transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(0,255,204,0.6)] -translate-y-1' : ''}`}>{tab.icon}</span>
              <span className={`text-[8px] font-black uppercase tracking-widest transition-all ${isActive ? 'opacity-100 font-bold' : 'opacity-60'}`}>{tab.label}</span>
            </button>
          )
        })}
      </nav>

      <style jsx global>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </main >
  );
}
