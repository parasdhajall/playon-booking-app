import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Coins,
  Percent,
  Calendar,
  Search,
  Users,
  CheckCircle2,
  Clock,
  Printer,
  Share2,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  X,
  Copy,
  Check,
  DollarSign,
  TrendingUp,
  Sparkles,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtIST, gameLabel } from "@/lib/matka";

type Market = { id: string; name: string };

type AgentBet = {
  id: string;
  user_id: string;
  market_id: string;
  game_type: string;
  session: string;
  number: string;
  points: number;
  payout: number;
  status: string;
  created_at: string;
  player: string;
};

type AgentSummary = {
  id: string;
  name: string;
  email: string;
  phone: string;
  walletPoints: number;
  commissionRate: number;
  totalSale: number;
  playCount: number;
  totalCommission: number;
  totalWinning: number;
  netHouseSettlement: number; // (totalSale - totalCommission) - totalWinning
  isSettled: boolean;
  bets: AgentBet[];
};

export function AdminCommission({ markets }: { markets: Market[] }) {
  const qc = useQueryClient();

  // Date Filters
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(yesterdayDate);

  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "custom" | "all">("today");
  const [customDate, setCustomDate] = useState<string>(todayDateStr);
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [showZeroBetAgents, setShowZeroBetAgents] = useState<boolean>(false);

  // Custom commission rates stored per agent: { [userId]: number }
  const [customRates, setCustomRates] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("playon_agent_commission_rates");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Settled status per agent per date: { [`${date}_${userId}`]: boolean }
  const [settledMap, setSettledMap] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("playon_agent_settled_status");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Modals state
  const [selectedAgentSlip, setSelectedAgentSlip] = useState<AgentSummary | null>(null);
  const [selectedAgentBets, setSelectedAgentBets] = useState<AgentSummary | null>(null);
  const [editingRateAgentId, setEditingRateAgentId] = useState<string | null>(null);
  const [tempRateInput, setTempRateInput] = useState<string>("10");
  const [copiedSlip, setCopiedSlip] = useState(false);

  // Quick Points Adjustment inline
  const [pointAdjustMap, setPointAdjustMap] = useState<Record<string, string>>({});

  const targetDate =
    dateFilter === "today"
      ? todayDateStr
      : dateFilter === "yesterday"
        ? yesterdayDateStr
        : customDate;

  const dateLabel =
    dateFilter === "today"
      ? `Today (${todayDateStr})`
      : dateFilter === "yesterday"
        ? `Yesterday (${yesterdayDateStr})`
        : dateFilter === "custom"
          ? customDate
          : "All Time";

  // Query all users/agents from DB
  const { data: users = [] } = useQuery({
    queryKey: ["admin-commission-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_users" as any);
      if (error) {
        const { data: profs, error: pErr } = await supabase.from("profiles").select("*");
        if (pErr) throw pErr;
        return (profs ?? []).map((p) => ({
          id: p.id,
          email: p.display_name || "Agent",
          display_name: p.display_name || "Agent",
          points: p.points || 0,
        }));
      }
      return (data ?? []).map((u: any) => ({
        id: u.id,
        email: u.email || "",
        display_name: u.display_name || u.email?.replace(/@.*$/, "") || "Agent",
        points: u.points || 0,
      }));
    },
  });

  // Query bets for the selected date range
  const { data: bets = [], isLoading: isBetsLoading } = useQuery({
    queryKey: ["admin-commission-bets", dateFilter, targetDate],
    refetchInterval: 12000,
    queryFn: async () => {
      let q = supabase.from("bets").select("*").order("created_at", { ascending: false });

      if (dateFilter !== "all" && targetDate) {
        const startIso = new Date(`${targetDate}T00:00:00+05:30`).toISOString();
        const endIso = new Date(`${targetDate}T23:59:59.999+05:30`).toISOString();
        q = q.gte("created_at", startIso).lte("created_at", endIso);
      } else {
        q = q.limit(2000);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AgentBet[];
    },
  });

  const marketName = (id: string) => markets.find((m) => m.id === id)?.name ?? "—";

  // Filter bets by market if selected
  const filteredBets = useMemo(() => {
    if (marketFilter === "all") return bets;
    return bets.filter((b) => b.market_id === marketFilter);
  }, [bets, marketFilter]);

  // Map user names
  const userMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; phone: string; points: number }>();
    for (const u of users) {
      // Extract raw phone number if email is phone format (e.g. 9096884094@... or plain 9096884094)
      const rawPhone = u.email ? u.email.replace(/@.*$/, "").replace(/[^0-9]/g, "") : "";
      map.set(u.id, {
        id: u.id,
        name: u.display_name || "Agent",
        email: u.email,
        phone: rawPhone.length === 10 ? rawPhone : "",
        points: u.points || 0,
      });
    }
    return map;
  }, [users]);

  // Aggregate Agent Summaries
  const agentSummaries: AgentSummary[] = useMemo(() => {
    const summaryMap = new Map<string, AgentSummary>();

    // Initialize all known users if showZeroBetAgents is true, or just track as needed
    for (const u of users) {
      if (showZeroBetAgents) {
        const rate = customRates[u.id] ?? 10;
        const settleKey = `${targetDate}_${u.id}`;
        const isSettled = !!settledMap[settleKey];

        summaryMap.set(u.id, {
          id: u.id,
          name: u.display_name,
          email: u.email,
          phone: userMap.get(u.id)?.phone || "",
          walletPoints: u.points,
          commissionRate: rate,
          totalSale: 0,
          playCount: 0,
          totalCommission: 0,
          totalWinning: 0,
          netHouseSettlement: 0,
          isSettled,
          bets: [],
        });
      }
    }

    // Process bets
    for (const b of filteredBets) {
      if (b.status === "refunded") continue;

      const uInfo = userMap.get(b.user_id);
      const name = uInfo?.name || "Agent";
      const email = uInfo?.email || "";
      const phone = uInfo?.phone || "";
      const walletPoints = uInfo?.points || 0;
      const rate = customRates[b.user_id] ?? 10; // Default 10%
      const settleKey = `${targetDate}_${b.user_id}`;
      const isSettled = !!settledMap[settleKey];

      let item = summaryMap.get(b.user_id);
      if (!item) {
        item = {
          id: b.user_id,
          name,
          email,
          phone,
          walletPoints,
          commissionRate: rate,
          totalSale: 0,
          playCount: 0,
          totalCommission: 0,
          totalWinning: 0,
          netHouseSettlement: 0,
          isSettled,
          bets: [],
        };
        summaryMap.set(b.user_id, item);
      }

      item.totalSale += b.points;
      item.playCount += 1;
      if (b.status === "won") {
        item.totalWinning += b.payout || 0;
      }
      item.bets.push({ ...b, player: name });
    }

    // Final calculations for each agent
    const list = [...summaryMap.values()].map((a) => {
      const commAmount = Math.round((a.totalSale * a.commissionRate) / 100);
      const netSettlement = a.totalSale - commAmount - a.totalWinning;
      return {
        ...a,
        totalCommission: commAmount,
        netHouseSettlement: netSettlement,
      };
    });

    // Sort by highest total sale first
    list.sort((a, b) => b.totalSale - a.totalSale);

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      return list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.phone.includes(q)
      );
    }

    return list;
  }, [users, filteredBets, userMap, customRates, settledMap, targetDate, showZeroBetAgents, search]);

  // Overall Financial Totals
  const grandTotals = useMemo(() => {
    let grossSale = 0;
    let totalPlays = 0;
    let totalCommission = 0;
    let totalWinnings = 0;
    let activeAgentsCount = 0;

    for (const a of agentSummaries) {
      if (a.totalSale > 0 || a.playCount > 0) {
        grossSale += a.totalSale;
        totalPlays += a.playCount;
        totalCommission += a.totalCommission;
        totalWinnings += a.totalWinning;
        activeAgentsCount += 1;
      }
    }

    const netHouseSettlement = grossSale - totalCommission - totalWinnings;

    return {
      grossSale,
      totalPlays,
      totalCommission,
      totalWinnings,
      netHouseSettlement,
      activeAgentsCount,
    };
  }, [agentSummaries]);

  // Save custom commission rate
  const handleSaveRate = (agentId: string, rate: number) => {
    const updated = { ...customRates, [agentId]: rate };
    setCustomRates(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("playon_agent_commission_rates", JSON.stringify(updated));
    }
    toast.success(`Commission rate set to ${rate}%!`);
    setEditingRateAgentId(null);
  };

  // Toggle settled status
  const handleToggleSettled = (agentId: string) => {
    const settleKey = `${targetDate}_${agentId}`;
    const nextVal = !settledMap[settleKey];
    const updated = { ...settledMap, [settleKey]: nextVal };
    setSettledMap(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("playon_agent_settled_status", JSON.stringify(updated));
    }
    toast.success(nextVal ? "Marked as Settled! ✅" : "Marked as Pending! ⏳");
  };

  // Quick Points adjust
  const handleAdjustPoints = async (agentId: string) => {
    const amount = Number(pointAdjustMap[agentId]);
    if (!amount || isNaN(amount)) {
      toast.error("Enter a valid amount (e.g. 500 or -200)");
      return;
    }
    const { error } = await supabase.rpc("admin_adjust_points" as any, {
      _user_id: agentId,
      _points: amount,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Updated balance by ${amount > 0 ? "+" + amount : amount} ₹!`);
    setPointAdjustMap({ ...pointAdjustMap, [agentId]: "" });
    qc.invalidateQueries({ queryKey: ["admin-commission-users"] });
  };

  // Generate WhatsApp Message Text
  const generateWhatsAppMessage = (a: AgentSummary) => {
    const isLena = a.netHouseSettlement >= 0;
    const netFormatted = `₹${Math.abs(a.netHouseSettlement).toLocaleString("en-IN")}`;
    const statusNote = isLena
      ? `👉 *HISAAB:* (Agent se ${netFormatted} LENE HAIN)`
      : `👉 *HISAAB:* (Agent ko ${netFormatted} DENE HAIN - Winning Claim)`;

    return `*📊 PLAYON DAILY AGENT HISAB SLIP*
--------------------------------
👤 *Agent:* ${a.name}
📅 *Date:* ${dateLabel}
🏢 *Market:* ${marketFilter === "all" ? "All Markets Combined" : marketName(marketFilter)}
--------------------------------
💰 *Total Business (Sale):* ₹${a.totalSale.toLocaleString("en-IN")} (${a.playCount} plays)
🎁 *Agent Commission (${a.commissionRate}%):* -₹${a.totalCommission.toLocaleString("en-IN")}
🏆 *Customer Winning Claim:* -₹${a.totalWinning.toLocaleString("en-IN")}
--------------------------------
💵 *NET SETTLEMENT:* ${isLena ? "+" : "-"}${netFormatted}
${statusNote}
--------------------------------
💼 *Wallet Current Balance:* ₹${a.walletPoints.toLocaleString("en-IN")}
================================
_PlayOn Official Matka Management System_`;
  };

  const handleShareWhatsApp = (a: AgentSummary) => {
    const text = generateWhatsAppMessage(a);
    const encoded = encodeURIComponent(text);
    const phone = a.phone ? `91${a.phone}` : "";
    const url = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, "_blank");
  };

  const handleCopySlip = (a: AgentSummary) => {
    const text = generateWhatsAppMessage(a);
    navigator.clipboard.writeText(text);
    setCopiedSlip(true);
    toast.success("Hisab slip copied to clipboard!");
    setTimeout(() => setCopiedSlip(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <section className="space-y-6">
      {/* 1. Header Banner */}
      <div className="rounded-2xl border-2 border-gold/40 bg-card/95 p-5 shadow-xl space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-2xl border border-gold/40 shadow-inner">
              💰
            </span>
            <div>
              <h2 className="font-display text-2xl tracking-wide text-gold flex items-center gap-2">
                Agent Commission & Daily Khata
                <span className="rounded-md bg-gold/20 border border-gold/40 text-gold font-bold text-xs px-2.5 py-0.5">
                  10% Patti / Cut
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Automatic calculation of agent sales, 10% commission deduction, winning claims, and 1-click WhatsApp hisab slips.
              </p>
            </div>
          </div>

          {/* Quick Date Filters */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-secondary/80 p-1">
            <button
              type="button"
              onClick={() => setDateFilter("today")}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                dateFilter === "today"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("yesterday")}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                dateFilter === "yesterday"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("custom")}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                dateFilter === "custom"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Date
            </button>
            <button
              type="button"
              onClick={() => setDateFilter("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                dateFilter === "all"
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {/* Date Picker Input when custom is chosen */}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/60">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Select Specific Date:</span>
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="rounded-md border bg-card px-2.5 py-1 text-xs font-bold text-foreground focus:outline-none"
            />
          </div>
        )}

        {/* Market Filter Bar */}
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-0.5">
            <span>Filter by Bazar / Market:</span>
            <span>
              Active Agents Today: <strong className="text-gold font-bold">{grandTotals.activeAgentsCount}</strong>
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => setMarketFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                marketFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary"
                  : "border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              All Markets Combined
            </button>
            {markets.map((m) => {
              const isActive = marketFilter === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarketFilter(m.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-gold text-slate-950 font-black shadow-md ring-2 ring-gold scale-105"
                      : "border bg-card text-foreground hover:border-gold hover:bg-secondary"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Top Metric Cards (Financial Summary for Selected Date) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Gross Sale */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Gross Sale (Total Bet)</span>
            <DollarSign className="h-4 w-4 text-gold" />
          </div>
          <div className="font-mono text-2xl font-black text-foreground">
            ₹{grandTotals.grossSale.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            From <strong className="text-foreground">{grandTotals.totalPlays}</strong> player bets
          </div>
        </div>

        {/* Card 2: Total Commission */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Agent Commission (10%)</span>
            <Percent className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="font-mono text-2xl font-black text-emerald-500">
            ₹{grandTotals.totalCommission.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Agent brokerage / patti cut
          </div>
        </div>

        {/* Card 3: Customer Winnings */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Winning Claims</span>
            <ArrowDownRight className="h-4 w-4 text-rose-500" />
          </div>
          <div className="font-mono text-2xl font-black text-rose-500">
            ₹{grandTotals.totalWinnings.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Customer payouts to be deducted
          </div>
        </div>

        {/* Card 4: Net House Settlement */}
        <div
          className={`rounded-xl border p-4 shadow-sm space-y-1 ${
            grandTotals.netHouseSettlement >= 0
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/40 bg-rose-500/10 text-rose-400"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider">
              {grandTotals.netHouseSettlement >= 0 ? "Net House Receivable" : "Net House Payable"}
            </span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="font-mono text-2xl font-black">
            {grandTotals.netHouseSettlement >= 0 ? "+" : "-"}₹
            {Math.abs(grandTotals.netHouseSettlement).toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] font-bold">
            {grandTotals.netHouseSettlement >= 0
              ? "👉 Agents se collect karna hai"
              : "👉 Agents ko winning pay karni hai"}
          </div>
        </div>
      </div>

      {/* 3. Search & Options Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Agent name or mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs bg-card"
          />
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={showZeroBetAgents}
              onChange={(e) => setShowZeroBetAgents(e.target.checked)}
              className="rounded border-border text-primary focus:ring-0 cursor-pointer"
            />
            <span>Show all registered agents (including ₹0 bets)</span>
          </label>
        </div>
      </div>

      {/* 4. Agent Khata & Commission Table */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/80 text-left text-muted-foreground border-b">
              <tr>
                <th className="p-3">Agent Name & Mobile</th>
                <th className="text-center p-3">Commission %</th>
                <th className="text-right p-3">Gross Sale (₹)</th>
                <th className="text-right p-3">Commission (₹)</th>
                <th className="text-right p-3">Winning (₹)</th>
                <th className="text-right p-3">Net Settlement</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3 pr-4">Actions / Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {agentSummaries.map((a) => {
                const isLena = a.netHouseSettlement >= 0;
                const hasBets = a.totalSale > 0;

                return (
                  <tr
                    key={a.id}
                    className={`hover:bg-secondary/40 transition-colors ${
                      a.isSettled ? "opacity-75 bg-background/30" : ""
                    }`}
                  >
                    {/* Agent Name */}
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold shrink-0">
                          👤
                        </span>
                        <div>
                          <div className="font-bold text-foreground text-sm flex items-center gap-2">
                            {a.name}
                            {a.isSettled && (
                              <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0.2 font-extrabold">
                                SETTLED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2">
                            <span>Mob: {a.phone || a.email.replace("@playon.app", "")}</span>
                            <span>•</span>
                            <span>Wallet: <strong className="text-gold">₹{a.walletPoints.toLocaleString("en-IN")}</strong></span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Commission Rate % */}
                    <td className="p-3 text-center">
                      {editingRateAgentId === a.id ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="50"
                            value={tempRateInput}
                            onChange={(e) => setTempRateInput(e.target.value)}
                            className="w-14 rounded border bg-background px-1.5 py-0.5 text-center font-mono font-bold text-xs"
                          />
                          <Button
                            size="sm"
                            className="h-6 px-1.5 text-[10px] font-bold"
                            onClick={() => handleSaveRate(a.id, Number(tempRateInput) || 10)}
                          >
                            ✓
                          </Button>
                          <button
                            type="button"
                            onClick={() => setEditingRateAgentId(null)}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRateAgentId(a.id);
                            setTempRateInput(String(a.commissionRate));
                          }}
                          className="inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/30 px-2 py-0.5 font-mono font-bold hover:bg-gold/25 transition-colors cursor-pointer"
                          title="Click to change commission percentage"
                        >
                          <span>{a.commissionRate}%</span>
                          <span className="text-[10px] opacity-70">✎</span>
                        </button>
                      )}
                    </td>

                    {/* Gross Sale */}
                    <td className="p-3 text-right">
                      <div className="font-mono font-bold text-foreground text-sm">
                        ₹{a.totalSale.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {a.playCount} {a.playCount === 1 ? "play" : "plays"}
                      </div>
                    </td>

                    {/* Commission Cut */}
                    <td className="p-3 text-right font-mono font-bold text-emerald-500">
                      ₹{a.totalCommission.toLocaleString("en-IN")}
                    </td>

                    {/* Customer Winning */}
                    <td className="p-3 text-right font-mono font-bold text-rose-500">
                      ₹{a.totalWinning.toLocaleString("en-IN")}
                    </td>

                    {/* Net Settlement (Lena / Dena) */}
                    <td className="p-3 text-right">
                      <div
                        className={`font-mono text-sm font-black ${
                          isLena ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isLena ? "+" : "-"}₹{Math.abs(a.netHouseSettlement).toLocaleString("en-IN")}
                      </div>
                      <span
                        className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-extrabold uppercase tracking-wide ${
                          isLena
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {isLena ? "Lene Hain" : "Dene Hain"}
                      </span>
                    </td>

                    {/* Settled / Pending Toggle */}
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleSettled(a.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          a.isSettled
                            ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                            : "bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-gold/50"
                        }`}
                      >
                        {a.isSettled ? "✓ Settled" : "⏳ Pending"}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="p-3 pr-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* WhatsApp Share Button */}
                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(a)}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 transition-all shadow-sm cursor-pointer"
                          title="Share Hisab on WhatsApp"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>

                        {/* View Parchi / Receipt */}
                        <button
                          type="button"
                          onClick={() => setSelectedAgentSlip(a)}
                          className="rounded-lg border bg-secondary hover:bg-secondary/80 text-foreground p-1.5 transition-all cursor-pointer"
                          title="View & Print Hisab Slip"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>

                        {/* Inspect Bets */}
                        {hasBets && (
                          <button
                            type="button"
                            onClick={() => setSelectedAgentBets(a)}
                            className="rounded-lg border bg-secondary hover:bg-secondary/80 text-primary p-1.5 transition-all cursor-pointer"
                            title="Inspect Agent Plays"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {agentSummaries.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {isBetsLoading
                      ? "Loading agent plays and calculating commissions..."
                      : `No agent plays recorded for ${dateLabel}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. MODAL: THERMAL HISAB SLIP PREVIEW & PRINT */}
      {selectedAgentSlip && (
        <Dialog open={!!selectedAgentSlip} onOpenChange={() => setSelectedAgentSlip(null)}>
          <DialogContent className="sm:max-w-md p-4 max-h-[92vh] overflow-y-auto bg-card border-border">
            <DialogHeader className="pb-2 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/20 text-gold">
                    🧾
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold">
                      Agent Daily Hisab Slip
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedAgentSlip.name} • {dateLabel}
                    </p>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* 58mm Thermal Receipt Visual Container */}
            <div
              id="printable-agent-slip"
              className="my-3 p-4 bg-white text-black font-mono text-xs rounded-xl shadow-inner border border-dashed border-gray-400 select-all space-y-2.5"
            >
              {/* Receipt Header */}
              <div className="text-center space-y-0.5 border-b border-dashed border-gray-400 pb-2">
                <div className="text-lg font-black tracking-wider">PLAY ON</div>
                <div className="text-[11px] font-bold uppercase text-gray-700">AGENT DAILY HISAB PARCHI</div>
                <div className="text-[10px] text-gray-500">Date: {dateLabel}</div>
              </div>

              {/* Agent & Market Info */}
              <div className="space-y-1 text-[11px] border-b border-dashed border-gray-400 pb-2">
                <div className="flex justify-between font-bold">
                  <span>Agent:</span>
                  <span>{selectedAgentSlip.name}</span>
                </div>
                {selectedAgentSlip.phone && (
                  <div className="flex justify-between text-gray-600">
                    <span>Mobile:</span>
                    <span>{selectedAgentSlip.phone}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Bazar:</span>
                  <span>{marketFilter === "all" ? "All Markets" : marketName(marketFilter)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Plays:</span>
                  <span>{selectedAgentSlip.playCount} Plays</span>
                </div>
              </div>

              {/* Breakdown Ledger Table */}
              <div className="space-y-1.5 text-xs py-1 border-b border-dashed border-gray-400 pb-2">
                <div className="flex justify-between font-bold text-gray-800">
                  <span>Gross Sale (Total Bet):</span>
                  <span>₹{selectedAgentSlip.totalSale.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Commission ({selectedAgentSlip.commissionRate}%):</span>
                  <span>-₹{selectedAgentSlip.totalCommission.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>Customer Winnings:</span>
                  <span>-₹{selectedAgentSlip.totalWinning.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Net Payable / Receivable Result */}
              <div className="p-2.5 bg-gray-100 rounded-lg space-y-1 text-center border border-gray-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  {selectedAgentSlip.netHouseSettlement >= 0
                    ? "NET AMOUNT RECEIVABLE (LENE HAIN)"
                    : "NET AMOUNT PAYABLE (DENE HAIN)"}
                </div>
                <div className="text-xl font-black text-gray-900">
                  ₹{Math.abs(selectedAgentSlip.netHouseSettlement).toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] font-semibold text-gray-600">
                  {selectedAgentSlip.netHouseSettlement >= 0
                    ? "(Agent se yeh rashi collect karni hai)"
                    : "(Agent ko yeh winning rashi deni hai)"}
                </div>
              </div>

              {/* Wallet & Footer */}
              <div className="text-[10px] text-gray-500 pt-1 text-center space-y-0.5">
                <div>Current Wallet Points: ₹{selectedAgentSlip.walletPoints.toLocaleString("en-IN")}</div>
                <div>*** Thank You for Playing with PlayOn ***</div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs gap-1.5 cursor-pointer"
                onClick={() => handleCopySlip(selectedAgentSlip)}
              >
                {copiedSlip ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSlip ? "Copied!" : "Copy Text"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs gap-1.5 cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleShareWhatsApp(selectedAgentSlip)}
              >
                <Share2 className="h-3.5 w-3.5" />
                WhatsApp
              </Button>

              <Button
                size="sm"
                className="flex-1 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground font-bold shadow"
                onClick={handlePrint}
              >
                <Printer className="h-3.5 w-3.5" />
                Print Slip
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 6. MODAL: DETAILED AGENT PLAYS AUDIT */}
      {selectedAgentBets && (
        <Dialog open={!!selectedAgentBets} onOpenChange={() => setSelectedAgentBets(null)}>
          <DialogContent className="sm:max-w-2xl p-4 max-h-[90vh] overflow-y-auto bg-card border-border">
            <DialogHeader className="pb-2 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base font-bold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Plays by {selectedAgentBets.name} ({selectedAgentBets.bets.length} Bets)
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Audit all individual bets placed by this agent on {dateLabel}.
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="my-2 overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-secondary text-left text-muted-foreground">
                  <tr>
                    <th className="p-2.5">Time</th>
                    <th>Market</th>
                    <th>Game</th>
                    <th>Number</th>
                    <th className="text-right">Amount (₹)</th>
                    <th className="text-center">Status</th>
                    <th className="text-right pr-3">Winning (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {selectedAgentBets.bets.map((b) => (
                    <tr key={b.id} className="hover:bg-secondary/40">
                      <td className="p-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {fmtIST(b.created_at)}
                      </td>
                      <td className="font-medium text-foreground">{marketName(b.market_id)}</td>
                      <td>
                        {gameLabel(b.game_type)}{" "}
                        <span className="text-[10px] text-muted-foreground">({b.session})</span>
                      </td>
                      <td className="font-display text-sm font-bold text-primary">{b.number}</td>
                      <td className="text-right font-mono font-bold text-foreground">₹{b.points}</td>
                      <td className="text-center">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            b.status === "won"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : b.status === "lost"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="text-right pr-3 font-mono font-bold text-emerald-400">
                        {b.payout > 0 ? `+₹${b.payout}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedAgentBets(null)}
                className="text-xs font-bold"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

