import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Play, History, Calendar, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fmtTime, resultLabel, marketStatus, canMarketDeclareOpen, isMarketOpen, isMarketScheduledToday } from "@/lib/matka";
import { useAuth, useTodayExpense } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PlayOn — Online Matka Play" },
      { name: "description", content: "Play daily online number markets. Live results and instant plays." },
      { property: "og:title", content: "PlayOn — Online Matka Play" },
      { property: "og:description", content: "Play daily number markets. Instant play." },
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
  const { data: todayExp } = useTodayExpense(user?.id);

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
    // If market's open session for today hasn't arrived yet, any open/close panna is from yesterday
    const displayOpen = canOpen ? m.open_panna : null;
    const displayClose = canOpen ? m.close_panna : null;

    const st = marketStatus(m);
    const done = !canOpen ? false : !!displayClose;
    const isOpen = st.state === "open" && !done && sched.isRunningToday;
    const badge = isOpen
      ? "bg-success/20 text-success border-success/30"
      : "bg-destructive/20 text-destructive border-destructive/30";

    return (
      <article
        key={m.id}
        className="relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
      >
        {/* Header: Market Name and Live Status */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-2xl tracking-wide text-foreground">{m.name}</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground mt-0.5">
                <Calendar className="h-3 w-3 text-primary/70" /> {sched.scheduleLabel}
              </span>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
              {isOpen && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />}
              {!sched.isRunningToday ? `🚫 ${st.note}` : done ? "Results Declared" : st.note}
            </span>
          </div>

          {/* Main Digits Display */}
          <div className="my-4 rounded-lg bg-background/60 py-3 text-center">
            <p className="font-display text-4xl tracking-widest text-primary md:text-5xl">
              {resultLabel(displayOpen, displayClose)}
            </p>
          </div>
        </div>

        {/* Bottom: Timing & Direct Play Button */}
        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Open: <strong className="text-foreground">{fmtTime(m.open_time)}</strong>
            </span>
            <span>
              Close: <strong className="text-foreground">{fmtTime(m.close_time)}</strong>
            </span>
          </div>

          {/* Direct Play Button */}
          {isOpen ? (
            <Button
              asChild
              className="w-full font-semibold shadow-sm"
              variant="default"
            >
              <Link to="/play/$marketId" params={{ marketId: m.id }} className="flex items-center justify-center gap-2">
                <Play className="h-4 w-4 fill-current" />
                Play Now
              </Link>
            </Button>
          ) : (
            <Button
              disabled
              className="w-full font-semibold shadow-sm opacity-60 cursor-not-allowed"
              variant="secondary"
            >
              <Lock className="h-3.5 w-3.5 mr-1.5" />
              {!sched.isRunningToday ? `Closed (${sched.currentDayName} Off)` : done ? "Closed" : "Upcoming"}
            </Button>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* User Today's Expense Only */}
      {user && (
        <section className="mb-6 rounded-xl border border-primary/30 bg-card p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Bet (Expense)</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-primary">
                ₹{todayExp?.totalExpense ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">total bet played today</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {todayExp?.playsCount ?? 0} {todayExp?.playsCount === 1 ? "bet" : "bets"} played today
            </p>
          </div>

          <Link
            to="/history"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            <History className="h-3.5 w-3.5" /> View My Plays &rarr;
          </Link>
        </section>
      )}

      {/* Markets List */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-3xl tracking-wide text-foreground">Live Bazar Markets</h2>
        <span className="text-xs text-muted-foreground">All times in IST</span>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading markets…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
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
    </main>
  );
}
