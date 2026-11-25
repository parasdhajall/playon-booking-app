import { useState, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer, User, RefreshCw, AlertCircle, Coins, Percent, Trophy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useTodayExpense } from "@/hooks/useAuth";
import { gameLabel, fmtIST, getPlayerDisplayName } from "@/lib/matka";
import { ThermalReceiptModal } from "@/components/ThermalReceiptModal";
import { PrinterStatusBadge } from "@/components/PrinterStatusBadge";
import {
  printerManager,
  usePrinter,
  printAgentHisabViaSystem,
  type AgentHisabPrintData,
  type ReceiptData,
} from "@/lib/thermalPrinter";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "My Bets & History — PLAYON" },
      { name: "description", content: "See your PLAYON past bets, results and winnings." },
      { property: "og:title", content: "My Bets — PLAYON" },
      { property: "og:description", content: "Your PLAYON play and transaction history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }: { error?: any }) => (
    <main className="mx-auto max-w-lg p-8 text-center space-y-3">
      <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
      <h2 className="text-xl font-bold text-foreground">Could not load plays</h2>
      <p className="text-xs text-muted-foreground">{(error as any)?.message || "An unexpected error occurred while loading your plays."}</p>
      <div className="pt-2 flex justify-center gap-2">
        <Button onClick={() => window.location.reload()} variant="default" size="sm">
          Retry
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to Markets</Link>
        </Button>
      </div>
    </main>
  ),
  component: History,
});

const statusCls: Record<string, string> = {
  won: "text-success",
  lost: "text-destructive",
  pending: "text-primary",
  refunded: "text-muted-foreground",
};

// Safe date formatter to avoid RangeError on invalid/null timestamps
function safeFmtIST(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return fmtIST(iso);
  } catch {
    return "—";
  }
}

function History() {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: todayExp } = useTodayExpense(user?.id);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // 1. Fetch all markets to map market names reliably (never crashes on PostgREST join mismatch)
  const { data: markets = [] } = useQuery({
    queryKey: ["markets-history-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("markets").select("id, name");
      if (error) {
        console.warn("Markets lookup warning:", error.message);
        return [];
      }
      return data ?? [];
    },
    staleTime: 60000,
  });

  const marketMap = useMemo(() => new Map(markets.map((m) => [m.id, m.name])), [markets]);
  const getMarketName = (marketId: string) => marketMap.get(marketId) || "Market";

  // 2. Query user's bets directly (safe from schema cache join bugs)
  const {
    data: bets = [],
    isLoading: isBetsLoading,
    refetch: refetchBets,
  } = useQuery({
    queryKey: ["bets", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("bets")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) {
          console.error("Error fetching bets:", error.message);
          return [];
        }
        return data ?? [];
      } catch (err) {
        console.error("Bets query exception:", err);
        return [];
      }
    },
    refetchInterval: 15000,
  });

  // Calculate today's date in IST
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  }, []);

  // Filter today's bets safely without throwing RangeError
  const todayBets = useMemo(() => {
    if (!bets || bets.length === 0) return [];
    return bets.filter((b) => {
      if (!b.created_at) return false;
      try {
        const d = new Date(b.created_at);
        if (isNaN(d.getTime())) return false;
        const betDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
        return todayStr === betDateStr;
      } catch {
        return false;
      }
    });
  }, [bets, todayStr]);

  const { isConnected: isPrinterConnected } = usePrinter();
  const [viewFilter, setViewFilter] = useState<"today" | "all">("today");

  // Agent's commission rate (stored per agent in playon_agent_commission_rates or default 10%)
  const commissionRate = useMemo(() => {
    if (typeof window !== "undefined" && user?.id) {
      try {
        const saved = localStorage.getItem("playon_agent_commission_rates");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed[user.id] === "number") {
            return parsed[user.id];
          }
        }
      } catch {
        // fallback
      }
    }
    return 10; // Default 10%
  }, [user?.id]);

  const displayedBets = viewFilter === "today" ? todayBets : bets;

  const activeSale = useMemo(() => {
    return displayedBets.reduce((sum, b) => sum + (b.points || 0), 0);
  }, [displayedBets]);

  const activeCommission = useMemo(() => {
    return Math.round((activeSale * commissionRate) / 100);
  }, [activeSale, commissionRate]);

  const activeWinnings = useMemo(() => {
    return displayedBets
      .filter((b) => b.status === "won")
      .reduce((sum, b) => sum + (b.payout || 0), 0);
  }, [displayedBets]);

  const activePayableToAgent = activeCommission + activeWinnings;

  const isPrintingHisabRef = useRef(false);

  // Print Official Agent Commission & Hisab Slip
  const handlePrintAgentHisab = async () => {
    if (isPrintingHisabRef.current) return;
    if (todayBets.length === 0) {
      toast.error("No plays placed today to generate hisab slip");
      return;
    }
    isPrintingHisabRef.current = true;
    try {
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(now);

      const todaySale = todayBets.reduce((sum, b) => sum + (b.points || 0), 0);
      const todayComm = Math.round((todaySale * commissionRate) / 100);
      const todayWin = todayBets
        .filter((b) => b.status === "won")
        .reduce((sum, b) => sum + (b.payout || 0), 0);
      const todayTotal = todayComm + todayWin;

      const hisabData: AgentHisabPrintData = {
        agentName: getPlayerDisplayName(user, profile),
        phone: (profile as any)?.phone || "",
        marketName: "TODAY'S HISAB (ALL MARKETS)",
        dateStr,
        playCount: todayBets.length,
        totalSale: todaySale,
        commissionRate,
        totalCommission: todayComm,
        totalWinning: todayWin,
        totalAmount: todayTotal,
      };

      if (isPrinterConnected) {
        toast.info("Sending Commission Hisab to Bluetooth thermal printer...");
        const res = await printerManager.printAgentHisab(hisabData);
        if (res.success) {
          toast.success("Hisab slip printed successfully!");
          return;
        } else {
          toast.error(res.message);
        }
      }

      // Direct clean 58mm thermal print via isolated iframe (never blank!)
      printAgentHisabViaSystem(hisabData);
    } finally {
      isPrintingHisabRef.current = false;
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <RefreshCw className="h-6 w-6 animate-spin text-gold mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading your plays...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Sign In Required</h2>
        <p className="text-xs text-muted-foreground">Please sign in to see your play history and receipts.</p>
        <Button asChild>
          <Link to="/auth">Sign In to See Your Plays</Link>
        </Button>
      </main>
    );
  }

  const handlePrintSingle = (b: any) => {
    let dateStr = "";
    let timeStr = "";
    try {
      const d = b.created_at ? new Date(b.created_at) : new Date();
      dateStr = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
      timeStr = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      dateStr = todayStr;
      timeStr = "—";
    }

    setReceiptData({
      slipId: b.id ? b.id.slice(0, 8).toUpperCase() : "SLIP",
      marketName: getMarketName(b.market_id),
      playerName: getPlayerDisplayName(user, profile),
      dateStr,
      timeStr,
      items: [
        {
          gameLabel: gameLabel(b.game_type),
          session: (b.session === "close" ? "close" : "open") as "open" | "close",
          number: b.number || "—",
          points: b.points || 0,
        },
      ],
      totalPoints: b.points || 0,
    });
    setIsReceiptOpen(true);
  };

  const handlePrintTodayAll = () => {
    if (todayBets.length === 0) return;
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(now);
    const timeStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);

    const totalPts = todayBets.reduce((sum, b) => sum + (b.points || 0), 0);

    setReceiptData({
      slipId: `TD-${Date.now().toString().slice(-6)}`,
      marketName: "TODAY'S PLAYS",
      playerName: getPlayerDisplayName(user, profile),
      dateStr,
      timeStr,
      items: todayBets.map((b) => ({
        gameLabel: `${getMarketName(b.market_id).slice(0, 4)} ${gameLabel(b.game_type)}`,
        session: (b.session === "close" ? "close" : "open") as "open" | "close",
        number: b.number || "—",
        points: b.points || 0,
      })),
      totalPoints: totalPts,
    });
    setIsReceiptOpen(true);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24 sm:pb-12">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide text-gold">My Plays</h1>
          {user && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span>Agent / Player:</span>
              <strong className="text-gold font-semibold flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {getPlayerDisplayName(user, profile)}
              </strong>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PrinterStatusBadge showTextOnMobile={true} />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => refetchBets()}
            title="Refresh plays"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBetsLoading ? "animate-spin" : ""}`} />
          </Button>
          <span className="text-xs text-muted-foreground hidden sm:inline">Recent 200 plays</span>
        </div>
      </div>

      {/* 4-Stat Agent Commission & Hisab Cards */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {/* Card 1: Total Sale / Dhanda */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span>{viewFilter === "today" ? "Today's Sale" : "Total Sale"}</span>
          </div>
          <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
            ₹{activeSale.toLocaleString("en-IN")}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {displayedBets.length} {displayedBets.length === 1 ? "play" : "plays"} placed
          </p>
        </div>

        {/* Card 2: My Commission */}
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <Percent className="h-3.5 w-3.5 text-emerald-400" />
            <span>My Comm ({commissionRate}%)</span>
          </div>
          <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-emerald-400">
            +₹{activeCommission.toLocaleString("en-IN")}
          </div>
          <p className="mt-0.5 text-[11px] text-emerald-300/80">
            Your earned commission
          </p>
        </div>

        {/* Card 3: Total Winnings */}
        <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Trophy className="h-3.5 w-3.5 text-gold" />
            <span>{viewFilter === "today" ? "Today's Win" : "Total Win"}</span>
          </div>
          <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-foreground">
            ₹{activeWinnings.toLocaleString("en-IN")}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Winning customer payouts
          </p>
        </div>

        {/* Card 4: Total Payable / Payout */}
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gold uppercase tracking-wider">
            <Wallet className="h-3.5 w-3.5 text-gold" />
            <span>Total Payable</span>
          </div>
          <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-gold">
            ₹{activePayableToAgent.toLocaleString("en-IN")}
          </div>
          <p className="mt-0.5 text-[11px] text-gold/80">
            Comm ({commissionRate}%) + Winnings
          </p>
        </div>
      </div>

      {/* Filter Tabs & Print Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {/* Toggle View: Today vs All */}
        <div className="inline-flex rounded-lg bg-secondary/80 p-0.5 border">
          <button
            type="button"
            onClick={() => setViewFilter("today")}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
              viewFilter === "today"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Today's Plays ({todayBets.length})
          </button>
          <button
            type="button"
            onClick={() => setViewFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
              viewFilter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Plays ({bets.length})
          </button>
        </div>

        {/* Print Buttons */}
        <div className="flex items-center gap-2">
          {todayBets.length > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrintAgentHisab}
                className="h-8 text-xs font-bold border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Print official Agent Commission & Hisab Slip"
              >
                <Percent className="h-3.5 w-3.5" />
                Print Hisab Slip
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrintTodayAll}
                className="h-8 text-xs font-bold border-gold/40 text-gold hover:bg-gold/15 flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Print detailed play slips"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Plays Slip ({todayBets.length})
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-muted-foreground">
            <tr>
              <th className="p-3">Market</th>
              <th>Game</th>
              <th>Number</th>
              <th>Rupees (₹)</th>
              <th>Result</th>
              <th className="text-right pr-4">Print</th>
            </tr>
          </thead>
          <tbody>
            {isBetsLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin inline-block mr-2" />
                  Loading your plays...
                </td>
              </tr>
            )}

            {!isBetsLoading && displayedBets.map((b) => (
              <tr key={b.id} className="border-t hover:bg-secondary/20 transition-colors">
                <td className="p-3">
                  <div className="font-semibold text-foreground">{getMarketName(b.market_id)}</div>
                  <div className="text-xs text-muted-foreground">{safeFmtIST(b.created_at)} IST</div>
                </td>
                <td>
                  <span className="font-medium">{gameLabel(b.game_type)}</span>{" "}
                  <span className="text-xs capitalize text-muted-foreground font-mono">({b.session})</span>
                </td>
                <td className="font-display text-xl tracking-widest text-gold">{b.number}</td>
                <td className="font-semibold text-foreground font-mono">
                  <div>₹{b.points}</div>
                  <div className="text-[10px] text-emerald-400 font-sans font-semibold" title={`Agent Commission (${commissionRate}%)`}>
                    +₹{Math.round((b.points * commissionRate) / 100)} comm
                  </div>
                </td>
                <td className={`font-semibold capitalize ${statusCls[b.status] || "text-foreground"}`}>
                  {b.status}
                  {b.payout > 0 && <span className="text-success font-bold font-mono"> +₹{b.payout}</span>}
                </td>
                <td className="text-right pr-4">
                  <button
                    type="button"
                    onClick={() => handlePrintSingle(b)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-gold/10 transition-colors cursor-pointer"
                    title="Print Bill Slip"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}

            {!isBetsLoading && displayedBets.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {viewFilter === "today" ? "No plays placed today yet." : "No plays recorded yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Thermal Receipt Modal */}
      <ThermalReceiptModal
        open={isReceiptOpen}
        onOpenChange={setIsReceiptOpen}
        receiptData={receiptData}
      />
    </main>
  );
}
