import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer, User, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, useTodayExpense } from "@/hooks/useAuth";
import { gameLabel, fmtIST, getPlayerDisplayName } from "@/lib/matka";
import { ThermalReceiptModal } from "@/components/ThermalReceiptModal";
import { PrinterStatusBadge } from "@/components/PrinterStatusBadge";
import type { ReceiptData } from "@/lib/thermalPrinter";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "My Plays — PlayOn" },
      { name: "description", content: "See your past plays and winnings." },
      { property: "og:title", content: "My Plays — PlayOn" },
      { property: "og:description", content: "Your PlayOn play history." },
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
    <main className="mx-auto max-w-3xl px-4 py-8">
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

      {/* Today's Expense Summary */}
      <div className="mb-6 rounded-xl border border-primary/30 bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Bet (Expense)</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-bold text-primary">₹{todayExp?.totalExpense ?? 0}</span>
            <span className="text-xs text-muted-foreground">total played today</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {todayExp?.playsCount ?? 0} {todayExp?.playsCount === 1 ? "play" : "plays"} placed today
          </p>
        </div>

        {todayBets.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handlePrintTodayAll}
            className="h-10 text-xs font-bold border-gold/40 text-gold hover:bg-gold/15 flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Printer className="h-4 w-4" />
            Print Today's Slip ({todayBets.length} Plays)
          </Button>
        )}
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

            {!isBetsLoading && bets.map((b) => (
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
                <td className="font-semibold text-foreground font-mono">₹{b.points}</td>
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

            {!isBetsLoading && bets.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No plays recorded yet.
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
