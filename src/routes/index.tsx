import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Calendar,
  Clock,
  Play,
  Lock,
  Wallet,
  PlusCircle,
  ArrowUpRight,
  BookOpen,
  History,
  AlertCircle,
  BarChart2,
  TrendingUp,
  Sparkles,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  resultLabel,
  isMarketOpen,
  marketStatus,
  fmtTime,
  fmtBookingClose,
  canMarketDeclareOpen,
  isMarketScheduledToday,
  getEffectiveTimes,
} from "@/lib/matka";
import { useAuth, useProfile, useTodayExpense } from "@/hooks/useAuth";
import { AddFundsModal } from "@/components/wallet/AddFundsModal";
import { WithdrawModal } from "@/components/wallet/WithdrawModal";
import { PassbookModal } from "@/components/wallet/PassbookModal";
import { MarketChartModal } from "@/components/modals/MarketChartModal";
import { GameRatesModal } from "@/components/modals/GameRatesModal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Playon777 — Online Matka & Live Bazar Play" },
      { name: "description", content: "Playon777 — Play daily online matka & number markets. Live DPBoss results and instant wallet plays." },
      { property: "og:title", content: "Playon777 — Online Matka & Live Bazar Play" },
      { property: "og:description", content: "Playon777 Official Online Booking. Live results and instant plays." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }: { error?: any }) => (
    <main className="mx-auto max-w-lg p-8 text-center space-y-3">
      <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
      <h2 className="text-xl font-bold text-foreground">Could not load markets</h2>
      <p className="text-xs text-muted-foreground">{(error as any)?.message || "An unexpected error occurred while loading markets."}</p>
      <div className="pt-2 flex justify-center">
        <Button onClick={() => window.location.reload()} variant="default" size="sm">
          Retry
        </Button>
      </div>
    </main>
  ),
  component: Index,
});

export const marketsQuery = {
  queryKey: ["markets"],
  queryFn: async () => {
    const { data, error } = await supabase.from("markets").select("*").order("sort_order");
    if (error) throw error;
    return data;
  },
  refetchInterval: 30000,
};

function Index() {
  const { data: markets, isLoading } = useQuery(marketsQuery);
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: todayExp } = useTodayExpense(user?.id);

  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [passbookOpen, setPassbookOpen] = useState(false);
  const [gameRatesOpen, setGameRatesOpen] = useState(false);
  const [selectedChartMarket, setSelectedChartMarket] = useState<{ id: string; name: string } | null>(null);

  const openMarkets = useMemo(
    () => (markets ? markets.filter((m) => isMarketOpen(m)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []),
    [markets]
  );
  const closedMarkets = useMemo(
    () => (markets ? markets.filter((m) => !isMarketOpen(m)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []),
    [markets]
  );

  const renderMarketCard = (m: any) => {
    const sched = isMarketScheduledToday(m.name);
    const canOpen = canMarketDeclareOpen(m);
    const displayOpen = canOpen ? m.open_panna : null;
    const displayClose = canOpen ? m.close_panna : null;

    const st = marketStatus(m);
    const done = !canOpen ? false : !!displayClose;
    const isOpen = st.state === "open" && !done && sched.isRunningToday;
    const badge = isOpen
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : "bg-destructive/15 text-destructive border-destructive/30";

    const eff = getEffectiveTimes(m);

    return (
      <article
        key={m.id}
        className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md ${
          isOpen
            ? "border-gold/40 bg-gradient-to-b from-card via-card to-gold/5"
            : "border-border/60 bg-card/60 opacity-90"
        } p-4 sm:p-5`}
      >
        {/* Header: Market Name and Live Status */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-2xl sm:text-3xl tracking-wide text-foreground font-bold">
                {m.name}
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground mt-0.5">
                <Calendar className="h-3 w-3 text-gold/80" /> {sched.scheduleLabel}
              </span>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge}`}>
              {isOpen && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
              {!sched.isRunningToday ? `🚫 ${st.note}` : done ? "Result Declared" : st.note}
            </span>
          </div>

          {/* DPSARA Style Main Digits Display Box */}
          <div className="my-3.5 rounded-xl border border-gold/30 bg-background/80 py-3 px-2 text-center shadow-inner relative overflow-hidden">
            <p className="font-display text-4xl tracking-widest text-gold md:text-5xl font-black drop-shadow-sm">
              {resultLabel(displayOpen, displayClose)}
            </p>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 block mt-0.5">
              {displayOpen ? "Live Declared Result" : "Today's Result"}
            </span>
          </div>
        </div>

        {/* Bottom: Timing & Dual Action Buttons (Play & Chart) */}
        <div className="mt-1 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-1 px-0.5">
            <span
              className="flex items-center gap-1"
              title={`Open Result: ${fmtTime(eff.open_time)} | Counter Closes: ${fmtBookingClose(eff.open_time)}`}
            >
              <Clock className="h-3.5 w-3.5 text-gold" /> Open:{" "}
              <strong className="text-foreground font-mono">{fmtTime(eff.open_time)}</strong>
              <span className="text-[10px] text-amber-400 font-semibold">({fmtBookingClose(eff.open_time)})</span>
            </span>
            <span
              className="flex items-center gap-1"
              title={`Close Result: ${fmtTime(eff.close_time)} | Counter Closes: ${fmtBookingClose(eff.close_time)}`}
            >
              Close: <strong className="text-foreground font-mono">{fmtTime(eff.close_time)}</strong>
              <span className="text-[10px] text-amber-400 font-semibold">({fmtBookingClose(eff.close_time)})</span>
            </span>
          </div>

          {/* DPSARA Dual Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {/* 1. PLAY BUTTON */}
            {isOpen ? (
              <Button
                asChild
                className="flex-1 h-10 font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-md cursor-pointer"
                size="default"
              >
                <Link
                  to="/play/$marketId"
                  params={{ marketId: m.id }}
                  className="flex items-center justify-center gap-2 tracking-wide text-xs sm:text-sm uppercase"
                >
                  <Play className="h-4 w-4 fill-current text-black" />
                  Play Game
                </Link>
              </Button>
            ) : (
              <Button
                disabled
                className="flex-1 h-10 font-bold rounded-xl opacity-60 cursor-not-allowed bg-muted text-muted-foreground text-xs uppercase"
                variant="secondary"
              >
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                {!sched.isRunningToday ? `Closed (${sched.currentDayName} Off)` : done ? "Closed" : "Upcoming"}
              </Button>
            )}

            {/* 2. CHART BUTTON */}
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => setSelectedChartMarket({ id: m.id, name: m.name })}
              className="h-10 px-3.5 rounded-xl border-gold/40 text-gold hover:bg-gold/15 font-bold text-xs gap-1.5 cursor-pointer shrink-0"
              title={`View ${m.name} Panel & Jodi Chart`}
            >
              <BarChart2 className="h-4 w-4" />
              <span>Chart</span>
            </Button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <main className="mx-auto max-w-5xl px-3 sm:px-4 py-4 sm:py-6 pb-24 sm:pb-12">
      {/* PLAYON Guest Banner */}
      {!user && (
        <section className="mb-5 rounded-2xl border border-gold/40 bg-gradient-to-r from-card via-gold/10 to-card p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            <img src="/icon.svg" alt="Playon777" className="h-12 w-12 object-contain shrink-0 rounded-2xl shadow-xs" />
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-wide text-gold">
                Welcome to Playon777
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official Online Bazar Booking. Instant UPI Deposit & Fast Withdrawals.
              </p>
            </div>
          </div>
          <Button asChild size="default" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm px-5 h-10 rounded-xl shadow-md w-full sm:w-auto shrink-0">
            <Link to="/auth">Sign In to Play &rarr;</Link>
          </Button>
        </section>
      )}

      {/* User Wallet & Quick Play Dashboard */}
      {user && (
        <section className="mb-5 rounded-2xl border border-gold/40 bg-gradient-to-r from-card via-gold/5 to-card p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left: Balances */}
            <div className="flex items-center gap-6">
              <div>
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5 text-emerald-400" /> Available Balance
                </span>
                <p className="font-display text-3xl sm:text-4xl font-extrabold text-gold tracking-wide mt-0.5">
                  ₹{profile?.points ?? 0}
                </p>
              </div>

              <div className="h-10 w-px bg-border/60" />

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Today's Bet
                </span>
                <p className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-wide mt-0.5">
                  ₹{todayExp?.totalExpense ?? 0}
                </p>
                <span className="text-[10px] text-muted-foreground">{todayExp?.playsCount ?? 0} bets today</span>
              </div>
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => setAddFundsOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5 shadow-sm rounded-xl cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                Add Money
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setWithdrawOpen(true)}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 font-bold text-xs h-9 gap-1.5 rounded-xl cursor-pointer"
              >
                <ArrowUpRight className="h-4 w-4" />
                Withdraw
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPassbookOpen(true)}
                className="font-bold text-xs h-9 gap-1.5 rounded-xl cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5 text-gold" />
                Passbook
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGameRatesOpen(true)}
                className="font-bold text-xs h-9 gap-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-xl cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                Game Rates
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Android APK Download Prompt Card */}
      <section className="mb-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-card to-card p-3.5 sm:p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-left w-full sm:w-auto">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-inner">
            <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-foreground">
                Download Playon777 Android App
              </h3>
              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                APK
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
              Direct Android Install &bull; Fast Bidding &bull; Bluetooth Thermal Print Support
            </p>
          </div>
        </div>
        <a
          href="/Playon777.apk"
          download="Playon777.apk"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all shrink-0 cursor-pointer"
        >
          <Download className="h-4 w-4" />
          <span>Download App (APK)</span>
        </a>
      </section>

      {/* Top Quick Utility Toolbar */}
      <div className="mb-3.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl sm:text-3xl tracking-wide text-foreground font-bold">
            Live Bazar Markets
          </h2>
          <Badge variant="outline" className="text-[10px] font-bold border-gold/40 text-gold bg-gold/10">
            {openMarkets.length} Active Today
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setGameRatesOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold text-gold hover:underline cursor-pointer bg-gold/10 px-2.5 py-1 rounded-lg border border-gold/30"
          >
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            <span>Rates Chart</span>
          </button>
          <a
            href="https://wa.me/918143175017?text=Hello%20PLAYON%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline cursor-pointer bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30"
          >
            <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span>Help</span>
          </a>
        </div>
      </div>

      {isLoading && (
        <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading live bazar markets…
        </div>
      )}

      {/* Markets Grid */}
      <div className="grid gap-3.5 sm:gap-4 sm:grid-cols-2">
        {openMarkets.map(renderMarketCard)}

        {closedMarkets.length > 0 && openMarkets.length > 0 && (
          <div className="col-span-full my-2 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
              Closed Markets
            </span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        )}

        {closedMarkets.map(renderMarketCard)}
      </div>

      {/* Wallet Modals */}
      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
      <WithdrawModal open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      <PassbookModal
        open={passbookOpen}
        onOpenChange={setPassbookOpen}
        onOpenDeposit={() => setAddFundsOpen(true)}
        onOpenWithdraw={() => setWithdrawOpen(true)}
      />

      {/* Market Chart & Game Rates Modals */}
      <MarketChartModal
        market={selectedChartMarket}
        open={!!selectedChartMarket}
        onOpenChange={(open) => !open && setSelectedChartMarket(null)}
      />
      <GameRatesModal open={gameRatesOpen} onOpenChange={setGameRatesOpen} />
    </main>
  );
}