import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  ShieldCheck,
  Flame,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  Trash2,
  Plus,
  Sliders,
  DollarSign,
  BarChart3,
  Calendar,
  X,
  Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GAMES, type GameType, fmtTime } from "@/lib/matka";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface HedgedEntry {
  marketId: string;
  gameType: string;
  session: string;
  number: string;
  passedPoints: number;
  updatedAt: string;
}

interface AdminRiskHedgingProps {
  markets: Array<{
    id: string;
    name: string;
    open_time: string;
    close_time: string;
    active: boolean;
    open_panna?: string | null;
    close_panna?: string | null;
  }>;
}

function getGameMultiplier(gameType: string, number: string): number {
  if (gameType === "single" || gameType === "ank_bulk") return 9;
  if (gameType === "jodi" || gameType === "jodi_bulk" || gameType === "family_jodi") return 90;
  if (gameType === "half_sangam") return 1000;
  if (gameType === "full_sangam") return 10000;
  // Panna games
  const digits = number.replace(/\D/g, "");
  const distinct = new Set(digits.split("")).size;
  if (distinct === 1) return 600; // Triple panna
  if (distinct === 2) return 280; // Double panna
  return 140; // Single panna / family panna
}

function getGameCategory(gameType: string): "jodi" | "single" | "panna" | "sangam" {
  if (gameType === "jodi" || gameType === "jodi_bulk" || gameType === "family_jodi") return "jodi";
  if (gameType === "single" || gameType === "ank_bulk") return "single";
  if (gameType.includes("sangam")) return "sangam";
  return "panna";
}

export function AdminRiskHedging({ markets }: AdminRiskHedgingProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<string>(() => markets[0]?.id || "");
  const [selectedSession, setSelectedSession] = useState<"all" | "open" | "close">("all");
  const [activeCategory, setActiveCategory] = useState<"all" | "jodi" | "single" | "panna">("all");
  const [searchNumber, setSearchNumber] = useState("");

  // Date Filter State
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterdayDate);

  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "custom" | "all">("today");
  const [customDate, setCustomDate] = useState<string>(todayDateStr);

  const selectedTargetDate =
    dateFilter === "today"
      ? todayDateStr
      : dateFilter === "yesterday"
      ? yesterdayDateStr
      : customDate;

  // Hedged Loads Ledger stored in localStorage (Client-isolated, 0 DB changes, safe to test/revert)
  const [hedgedMap, setHedgedMap] = useState<Record<string, HedgedEntry>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("admin_hedged_loads_ledger");
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse hedged loads ledger:", e);
      }
    }
    return {};
  });

  const saveHedgedMap = (newMap: Record<string, HedgedEntry>) => {
    setHedgedMap(newMap);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin_hedged_loads_ledger", JSON.stringify(newMap));
    }
  };

  // Input states for passing load on specific numbers
  const [inputPassedAmounts, setInputPassedAmounts] = useState<Record<string, string>>({});

  // Query bets for the selected date & market
  const { data: bets = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-risk-bets", dateFilter, selectedTargetDate, selectedMarketId],
    refetchInterval: 10000,
    queryFn: async () => {
      let query = supabase
        .from("bets")
        .select("id, user_id, market_id, game_type, session, number, points, payout, status, created_at")
        .order("created_at", { ascending: false });

      if (dateFilter !== "all" && selectedTargetDate) {
        const startIso = new Date(`${selectedTargetDate}T00:00:00+05:30`).toISOString();
        const endIso = new Date(`${selectedTargetDate}T23:59:59.999+05:30`).toISOString();
        query = query.gte("created_at", startIso).lte("created_at", endIso);
      }

      if (selectedMarketId) {
        query = query.eq("market_id", selectedMarketId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).filter((b) => b.status !== "refunded");
    },
  });

  // Calculate Total Market Turnover
  const totalMarketTurnover = useMemo(() => {
    return bets.reduce((acc, b) => acc + (b.points || 0), 0);
  }, [bets]);

  // Aggregate exposure grouped by GameCategory + Session + Number
  const exposures = useMemo(() => {
    type ExposureItem = {
      key: string;
      marketId: string;
      gameType: string;
      category: "jodi" | "single" | "panna" | "sangam";
      session: string;
      number: string;
      rate: number;
      totalPoints: number;
      playsCount: number;
      grossLiability: number;
      passedPoints: number;
      houseKeptPoints: number;
      houseNetLiability: number;
      liabilityShielded: number;
    };

    const map = new Map<string, ExposureItem>();

    for (const b of bets) {
      if (selectedSession !== "all" && b.session !== selectedSession) {
        continue;
      }

      const cat = getGameCategory(b.game_type);
      const sess = cat === "jodi" ? "close" : b.session;
      const key = `${b.market_id}|${cat}|${sess}|${b.number}`;
      const rate = getGameMultiplier(b.game_type, b.number);

      const existing = map.get(key) || {
        key,
        marketId: b.market_id,
        gameType: b.game_type,
        category: cat,
        session: sess,
        number: b.number,
        rate,
        totalPoints: 0,
        playsCount: 0,
        grossLiability: 0,
        passedPoints: 0,
        houseKeptPoints: 0,
        houseNetLiability: 0,
        liabilityShielded: 0,
      };

      existing.totalPoints += b.points || 0;
      existing.playsCount += 1;
      existing.grossLiability = existing.totalPoints * rate;

      map.set(key, existing);
    }

    // Apply Hedging / Passed Loads from ledger
    const list: ExposureItem[] = [];
    for (const item of map.values()) {
      const hedge = hedgedMap[item.key];
      const passed = hedge ? hedge.passedPoints : 0;
      item.passedPoints = passed;
      item.houseKeptPoints = Math.max(0, item.totalPoints - passed);
      item.houseNetLiability = item.houseKeptPoints * item.rate;
      item.liabilityShielded = Math.min(passed, item.totalPoints) * item.rate;
      list.push(item);
    }

    // Sort strictly by Gross Liability descending (highest disaster risk first)
    return list.sort((a, b) => b.grossLiability - a.grossLiability);
  }, [bets, selectedSession, hedgedMap]);

  // Filtered Exposures for display
  const filteredExposures = useMemo(() => {
    return exposures.filter((e) => {
      if (activeCategory !== "all" && e.category !== activeCategory) return false;
      if (searchNumber.trim() && !e.number.includes(searchNumber.trim())) return false;
      return true;
    });
  }, [exposures, activeCategory, searchNumber]);

  // Top 3 Highest Risk Numbers across the market
  const top3Risks = useMemo(() => {
    return exposures.slice(0, 3);
  }, [exposures]);

  // Aggregated Hedging Metrics
  const metrics = useMemo(() => {
    const totalPassedPoints = exposures.reduce((acc, e) => acc + e.passedPoints, 0);
    const totalLiabilityShielded = exposures.reduce((acc, e) => acc + e.liabilityShielded, 0);
    const worstCaseUnhedged = exposures.length > 0 ? exposures[0]?.grossLiability ?? 0 : 0;
    const worstCaseHouseKept = exposures.length > 0 ? Math.max(...exposures.map((e) => e.houseNetLiability)) : 0;

    return {
      totalPassedPoints,
      totalLiabilityShielded,
      worstCaseUnhedged,
      worstCaseHouseKept,
      activeHedgesCount: exposures.filter((e) => e.passedPoints > 0).length,
    };
  }, [exposures]);

  // Handlers for passing / updating hedged amount
  const handleSetHedge = (item: (typeof exposures)[0], amount: number) => {
    const validAmount = Math.max(0, amount);
    if (validAmount === 0) {
      handleRemoveHedge(item.key);
      return;
    }

    const updated = {
      ...hedgedMap,
      [item.key]: {
        marketId: item.marketId,
        gameType: item.gameType,
        session: item.session,
        number: item.number,
        passedPoints: validAmount,
        updatedAt: new Date().toISOString(),
      },
    };
    saveHedgedMap(updated);
    toast.success(`Passed ₹${validAmount} on ${item.category.toUpperCase()} "${item.number}" to Big Boss!`);
  };

  const handleQuickPercent = (item: (typeof exposures)[0], pct: number) => {
    const amt = Math.round((item.totalPoints * pct) / 100);
    handleSetHedge(item, amt);
  };

  const handleQuickCapKeep = (item: (typeof exposures)[0], keepCap: number) => {
    if (item.totalPoints <= keepCap) {
      toast.info(`Total bet (₹${item.totalPoints}) is already within your kept capacity of ₹${keepCap}. Nothing to pass!`);
      return;
    }
    const passAmt = item.totalPoints - keepCap;
    handleSetHedge(item, passAmt);
  };

  const handleRemoveHedge = (key: string) => {
    const updated = { ...hedgedMap };
    delete updated[key];
    saveHedgedMap(updated);
    toast.info("Hedged load removed. Full liability restored to house.");
  };

  const handleResetMarketHedges = () => {
    if (!confirm("Are you sure you want to clear all passed loads for this market?")) return;
    const updated = { ...hedgedMap };
    for (const k of Object.keys(updated)) {
      if (k.startsWith(`${selectedMarketId}|`)) {
        delete updated[k];
      }
    }
    saveHedgedMap(updated);
    toast.success("All hedged loads cleared for this market.");
  };

  const activeMarket = markets.find((m) => m.id === selectedMarketId);

  return (
    <div className="space-y-5">
      {/* 1. Header Banner & Market Filter */}
      <div className="rounded-2xl border border-primary/30 bg-card p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <h2 className="font-display text-2xl tracking-wide text-foreground">
                Live Exposure & Load Hedging (लोड व कटाई)
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identify top heavy bets in real-time. Pass excess risk to big boss and shield your pocket from huge payouts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {/* Market Select */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Select Market</label>
            <select
              value={selectedMarketId}
              onChange={(e) => setSelectedMarketId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-bold text-foreground"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({fmtTime(m.open_time)} - {fmtTime(m.close_time)})
                </option>
              ))}
            </select>
          </div>

          {/* Session Filter */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Session</label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setSelectedSession("all")}
                className={`rounded py-1 font-semibold transition-all ${
                  selectedSession === "all" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedSession("open")}
                className={`rounded py-1 font-semibold transition-all ${
                  selectedSession === "open" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => setSelectedSession("close")}
                className={`rounded py-1 font-semibold transition-all ${
                  selectedSession === "close" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                Close
              </button>
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Date</label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={`rounded py-1 font-semibold transition-all ${
                  dateFilter === "today" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("yesterday")}
                className={`rounded py-1 font-semibold transition-all ${
                  dateFilter === "yesterday" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("all")}
                className={`rounded py-1 font-semibold transition-all ${
                  dateFilter === "all" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
                }`}
              >
                All Time
              </button>
            </div>
          </div>

          {/* Number Search */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">Search Number</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Find 45, 128, 7..."
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                className="pl-8 text-xs h-9 bg-background"
              />
              {searchNumber && (
                <button
                  type="button"
                  onClick={() => setSearchNumber("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics & Risk Comparison Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Collection */}
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5 text-primary" /> Total Market Turnover
          </span>
          <div className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
            ₹{totalMarketTurnover.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-muted-foreground">{bets.length} bets placed</span>
        </div>

        {/* Worst Case Unhedged */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 shadow-sm">
          <span className="text-[11px] font-medium text-destructive flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-destructive" /> Max Unprotected Risk
          </span>
          <div className="mt-1 font-display text-2xl font-bold tracking-wide text-destructive">
            ₹{metrics.worstCaseUnhedged.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-muted-foreground">If highest # opens without hedge</span>
        </div>

        {/* Load Passed to Boss */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-sm">
          <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1">
            <Sliders className="h-3.5 w-3.5 text-amber-500" /> Total Load Passed to Boss
          </span>
          <div className="mt-1 font-display text-2xl font-bold tracking-wide text-amber-500">
            ₹{metrics.totalPassedPoints.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-muted-foreground">{metrics.activeHedgesCount} numbers hedged</span>
        </div>

        {/* Protected House Risk */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 shadow-sm">
          <span className="text-[11px] font-medium text-emerald-500 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Shielded House Risk
          </span>
          <div className="mt-1 font-display text-2xl font-bold tracking-wide text-emerald-500">
            ₹{metrics.worstCaseHouseKept.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
            ₹{metrics.totalLiabilityShielded.toLocaleString("en-IN")} payout covered by Boss
          </span>
        </div>
      </div>

      {/* 3. Top 3 Highest Risk Numbers (Emergency Watchlist) */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-card via-amber-500/5 to-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15 text-destructive font-black text-xs">
              ⚡
            </span>
            <h3 className="font-display text-xl tracking-wide text-foreground">
              Top 3 Heaviest Risk Numbers ({activeMarket?.name || "Market"})
            </h3>
          </div>
          <span className="text-xs text-muted-foreground">Immediate action advised before market close</span>
        </div>

        {top3Risks.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground bg-secondary/30 rounded-xl">
            No heavy exposure detected for this market yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {top3Risks.map((item, idx) => {
              const rankColor =
                idx === 0
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : idx === 1
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-500"
                  : "border-blue-500/60 bg-blue-500/10 text-blue-500";

              const isHedged = item.passedPoints > 0;

              return (
                <div
                  key={item.key}
                  className="rounded-xl border bg-card p-3 space-y-3 shadow-sm hover:shadow transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-6 w-6 rounded-full flex items-center justify-center font-black text-xs border ${rankColor}`}>
                        #{idx + 1}
                      </span>
                      <div>
                        <span className="font-mono text-2xl font-black text-foreground block leading-none">
                          {item.number}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          {item.category.toUpperCase()} · {item.session.toUpperCase()} (×{item.rate})
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground block">Total Bet</span>
                      <strong className="font-mono text-sm text-foreground">₹{item.totalPoints}</strong>
                    </div>
                  </div>

                  {/* Liability & P&L Info */}
                  <div className="rounded-lg bg-secondary/50 p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross Payout:</span>
                      <strong className="text-destructive font-mono">₹{item.grossLiability.toLocaleString("en-IN")}</strong>
                    </div>
                    {isHedged && (
                      <>
                        <div className="flex justify-between text-amber-500">
                          <span>Passed to Boss:</span>
                          <strong className="font-mono">₹{item.passedPoints}</strong>
                        </div>
                        <div className="flex justify-between text-emerald-500 border-t pt-1 font-semibold">
                          <span>House Kept Payout:</span>
                          <strong className="font-mono">₹{item.houseNetLiability.toLocaleString("en-IN")}</strong>
                        </div>
                      </>
                    )}
                  </div>

                  {/* 1-Click Load Cutting & Passing Controls */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-semibold text-muted-foreground block">Pass Load to Boss:</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={item.totalPoints}
                        placeholder="Amount"
                        value={inputPassedAmounts[item.key] ?? (isHedged ? item.passedPoints : "")}
                        onChange={(e) =>
                          setInputPassedAmounts({ ...inputPassedAmounts, [item.key]: e.target.value })
                        }
                        className="text-xs font-mono h-8 bg-background"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const val = Number(inputPassedAmounts[item.key] ?? item.passedPoints);
                          handleSetHedge(item, val);
                        }}
                        className="h-8 text-xs font-bold px-3 bg-primary text-primary-foreground shrink-0"
                      >
                        Pass
                      </Button>
                    </div>

                    {/* Quick presets */}
                    <div className="flex gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => handleQuickPercent(item, 50)}
                        className="flex-1 rounded border bg-secondary/80 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPercent(item, 75)}
                        className="flex-1 rounded border bg-secondary/80 py-0.5 text-[10px] font-bold text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        75%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickCapKeep(item, 500)}
                        className="flex-1 rounded border bg-secondary/80 py-0.5 text-[10px] font-bold text-amber-500 hover:bg-amber-500/10"
                        title="Keep maximum ₹500 in house, pass the rest"
                      >
                        Keep ₹500
                      </button>
                      {isHedged && (
                        <button
                          type="button"
                          onClick={() => handleRemoveHedge(item.key)}
                          className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive hover:bg-destructive/20"
                          title="Reset / Unhedge"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Complete Exposure Table with Category Tabs */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="font-display text-xl tracking-wide text-foreground">
              All Number Liabilities ({filteredExposures.length})
            </h3>
          </div>

          {/* Category Tabs */}
          <div className="flex rounded-lg border bg-secondary/50 p-1 gap-1">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                activeCategory === "all" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("jodi")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                activeCategory === "jodi" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Jodi (90×)
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("single")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                activeCategory === "single" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Single (9×)
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("panna")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                activeCategory === "panna" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Panna
            </button>
          </div>
        </div>

        {/* Exposure Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-secondary/30 text-[11px] uppercase font-bold text-muted-foreground">
              <tr>
                <th className="py-2.5 px-3">Number</th>
                <th className="py-2.5 px-3">Game Type</th>
                <th className="py-2.5 px-3 text-right">Total Bet</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
                <th className="py-2.5 px-3 text-right">Gross Risk</th>
                <th className="py-2.5 px-3 text-center">Load Hedging (Pass)</th>
                <th className="py-2.5 px-3 text-right">House Net Risk</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredExposures.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No plays recorded for the selected filter.
                  </td>
                </tr>
              ) : (
                filteredExposures.map((item) => {
                  const isHedged = item.passedPoints > 0;
                  return (
                    <tr key={item.key} className={`hover:bg-secondary/40 transition-colors ${isHedged ? "bg-amber-500/5" : ""}`}>
                      <td className="py-2.5 px-3 font-mono text-base font-bold text-foreground">
                        {item.number}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-muted-foreground uppercase text-[10px]">
                        {item.category} · {item.session}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-foreground">
                        ₹{item.totalPoints}
                        <span className="block text-[10px] text-muted-foreground font-normal">({item.playsCount} plays)</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right text-gold font-bold">
                        {item.rate}×
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-destructive">
                        ₹{item.grossLiability.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isHedged ? (
                          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-amber-500">
                            Passed: ₹{item.passedPoints}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">100% In House</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-emerald-500">
                        ₹{item.houseNetLiability.toLocaleString("en-IN")}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            placeholder="Pass ₹"
                            value={inputPassedAmounts[item.key] ?? (isHedged ? item.passedPoints : "")}
                            onChange={(e) =>
                              setInputPassedAmounts({ ...inputPassedAmounts, [item.key]: e.target.value })
                            }
                            className="w-20 text-xs font-mono h-7 text-center bg-background"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              const val = Number(inputPassedAmounts[item.key] ?? item.passedPoints);
                              handleSetHedge(item, val);
                            }}
                            className="h-7 px-2 text-[11px] font-bold bg-primary text-primary-foreground"
                          >
                            Save
                          </Button>
                          {isHedged && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveHedge(item.key)}
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              title="Clear hedge"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info & Market Reset Button */}
        {metrics.activeHedgesCount > 0 && (
          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <span className="text-muted-foreground">
              Active Hedges in this Market: <strong className="text-foreground">{metrics.activeHedgesCount}</strong> (Total Passed: <strong className="text-amber-500 font-mono">₹{metrics.totalPassedPoints}</strong>)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetMarketHedges}
              className="text-xs h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              Reset All Passes for this Market
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

