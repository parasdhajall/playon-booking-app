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
  TrendingDown,
  Sparkles,
  FileText,
  Building2,
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
import { PrinterStatusBadge } from "./PrinterStatusBadge";
import { printerManager, usePrinter, printViaSystem, printAgentHisabViaSystem, type AgentHisabPrintData } from "@/lib/thermalPrinter";

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

type AgentMarketBreakdown = {
  marketId: string;
  marketName: string;
  totalSale: number;
  playCount: number;
  totalCommission: number;
  totalWinning: number;
  totalPayableToAgent: number;
  bets: AgentBet[];
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
  totalPayableToAgent: number; // Commission + Winning
  houseNetProfit: number;      // Total Sale - (Commission + Winning)
  isSettled: boolean;
  bets: AgentBet[];
  marketBreakdowns: AgentMarketBreakdown[];
};

export function AdminCommission({ markets }: { markets: Market[] }) {
  const qc = useQueryClient();
  const { isConnected: isPrinterConnected } = usePrinter();

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
  const [selectedSlipMarketId, setSelectedSlipMarketId] = useState<string>("all");
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

  // Filter bets by market if selected in top bar
  const filteredBets = useMemo(() => {
    if (marketFilter === "all") return bets;
    return bets.filter((b) => b.market_id === marketFilter);
  }, [bets, marketFilter]);

  // Map user names
  const userMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; phone: string; points: number }>();
    for (const u of users) {
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

  // Aggregate Agent Summaries with Market-wise breakdown
  const agentSummaries: AgentSummary[] = useMemo(() => {
    const summaryMap = new Map<string, AgentSummary>();

    // Initialize known users if showZeroBetAgents is true
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
          totalPayableToAgent: 0,
          houseNetProfit: 0,
          isSettled,
          bets: [],
          marketBreakdowns: [],
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
          totalPayableToAgent: 0,
          houseNetProfit: 0,
          isSettled,
          bets: [],
          marketBreakdowns: [],
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

    // Calculate per-market breakdown for each agent
    const list = [...summaryMap.values()].map((a) => {
      const commAmount = Math.round((a.totalSale * a.commissionRate) / 100);
      const payableToAgent = commAmount + a.totalWinning;
      const houseProfit = a.totalSale - payableToAgent;

      // Group bets by market
      const mBreakdownMap = new Map<string, {
        marketId: string;
        marketName: string;
        totalSale: number;
        playCount: number;
        totalWinning: number;
        bets: AgentBet[];
      }>();

      for (const b of a.bets) {
        let mItem = mBreakdownMap.get(b.market_id);
        if (!mItem) {
          mItem = {
            marketId: b.market_id,
            marketName: marketName(b.market_id),
            totalSale: 0,
            playCount: 0,
            totalWinning: 0,
            bets: [],
          };
          mBreakdownMap.set(b.market_id, mItem);
        }
        mItem.totalSale += b.points;
        mItem.playCount += 1;
        if (b.status === "won") {
          mItem.totalWinning += b.payout || 0;
        }
        mItem.bets.push(b);
      }

      const marketBreakdowns: AgentMarketBreakdown[] = [...mBreakdownMap.values()]
        .map((m) => {
          const mComm = Math.round((m.totalSale * a.commissionRate) / 100);
          const mPayable = mComm + m.totalWinning;
          return {
            marketId: m.marketId,
            marketName: m.marketName,
            totalSale: m.totalSale,
            playCount: m.playCount,
            totalCommission: mComm,
            totalWinning: m.totalWinning,
            totalPayableToAgent: mPayable,
            bets: m.bets,
          };
        })
        .sort((x, y) => y.totalSale - x.totalSale);

      return {
        ...a,
        totalCommission: commAmount,
        totalPayableToAgent: payableToAgent,
        houseNetProfit: houseProfit,
        marketBreakdowns,
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

    const totalPayableToAgents = totalCommission + totalWinnings;
    const totalHouseProfit = grossSale - totalPayableToAgents;

    return {
      grossSale,
      totalPlays,
      totalCommission,
      totalWinnings,
      totalPayableToAgents,
      totalHouseProfit,
      activeAgentsCount,
    };
  }, [agentSummaries]);

  // Active slip data for the selected agent and specific market (or combined)
  const activeSlipData = useMemo(() => {
    if (!selectedAgentSlip) return null;

    if (selectedSlipMarketId === "all") {
      return {
        marketName: "All Markets Combined",
        totalSale: selectedAgentSlip.totalSale,
        playCount: selectedAgentSlip.playCount,
        commissionRate: selectedAgentSlip.commissionRate,
        totalCommission: selectedAgentSlip.totalCommission,
        totalWinning: selectedAgentSlip.totalWinning,
        totalPayableToAgent: selectedAgentSlip.totalPayableToAgent,
      };
    }

    const found = selectedAgentSlip.marketBreakdowns.find((m) => m.marketId === selectedSlipMarketId);
    if (found) {
      return {
        marketName: found.marketName,
        totalSale: found.totalSale,
        playCount: found.playCount,
        commissionRate: selectedAgentSlip.commissionRate,
        totalCommission: found.totalCommission,
        totalWinning: found.totalWinning,
        totalPayableToAgent: found.totalPayableToAgent,
      };
    }

    return {
      marketName: "All Markets Combined",
      totalSale: selectedAgentSlip.totalSale,
      playCount: selectedAgentSlip.playCount,
      commissionRate: selectedAgentSlip.commissionRate,
      totalCommission: selectedAgentSlip.totalCommission,
      totalWinning: selectedAgentSlip.totalWinning,
      totalPayableToAgent: selectedAgentSlip.totalPayableToAgent,
    };
  }, [selectedAgentSlip, selectedSlipMarketId]);

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
    toast.success(nextVal ? "Marked as Paid / Settled! ✅" : "Marked as Pending! ⏳");
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

  // Generate WhatsApp Message: Clean Parchi without Admin Profit or Wallet Points
  const generateWhatsAppMessage = (a: AgentSummary, slipData = activeSlipData) => {
    const d = slipData || {
      marketName: "All Markets Combined",
      totalSale: a.totalSale,
      playCount: a.playCount,
      commissionRate: a.commissionRate,
      totalCommission: a.totalCommission,
      totalWinning: a.totalWinning,
      totalPayableToAgent: a.totalPayableToAgent,
    };

    return `*📊 प्ले ऑन — एजेंट हिसाब पर्ची*
--------------------------------
👤 *एजेंट:* ${a.name}
🏢 *बाजार:* ${d.marketName}
📅 *दिनांक:* ${dateLabel}
--------------------------------
💰 *कुल बिक्री (धंदा):* ₹${d.totalSale.toLocaleString("en-IN")} (${d.playCount} दांव)
🎁 *कमीशन (${d.commissionRate}%):* ₹${d.totalCommission.toLocaleString("en-IN")}
🏆 *विनिंग दावा:* ₹${d.totalWinning.toLocaleString("en-IN")}
================================
💵 *कुल देय रकम:* ₹${d.totalPayableToAgent.toLocaleString("en-IN")}
================================
_PlayOn Official Matka Management System_`;
  };

  const handleShareWhatsApp = (a: AgentSummary, marketId = "all") => {
    let slipData = null;
    if (marketId !== "all") {
      const found = a.marketBreakdowns.find((m) => m.marketId === marketId);
      if (found) {
        slipData = {
          marketName: found.marketName,
          totalSale: found.totalSale,
          playCount: found.playCount,
          commissionRate: a.commissionRate,
          totalCommission: found.totalCommission,
          totalWinning: found.totalWinning,
          totalPayableToAgent: found.totalPayableToAgent,
        };
      }
    }
    const text = generateWhatsAppMessage(a, slipData);
    const encoded = encodeURIComponent(text);
    const phone = a.phone ? `91${a.phone}` : "";
    const url = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, "_blank");
  };

  const handleCopySlip = (a: AgentSummary) => {
    const text = generateWhatsAppMessage(a, activeSlipData);
    navigator.clipboard.writeText(text);
    setCopiedSlip(true);
    toast.success("Hisab slip copied to clipboard!");
    setTimeout(() => setCopiedSlip(false), 2500);
  };

  const [isPrintingThermal, setIsPrintingThermal] = useState(false);

  const handleThermalPrint = async () => {
    if (!selectedAgentSlip || !activeSlipData) return;

    const data: AgentHisabPrintData = {
      agentName: selectedAgentSlip.name,
      phone: selectedAgentSlip.phone,
      marketName: activeSlipData.marketName,
      dateStr: dateLabel,
      playCount: activeSlipData.playCount,
      totalSale: activeSlipData.totalSale,
      commissionRate: activeSlipData.commissionRate,
      totalCommission: activeSlipData.totalCommission,
      totalWinning: activeSlipData.totalWinning,
      totalAmount: activeSlipData.totalPayableToAgent,
    };

    if (isPrinterConnected) {
      setIsPrintingThermal(true);
      toast.info("Sending parchi to thermal printer...");
      const res = await printerManager.printAgentHisab(data);
      setIsPrintingThermal(false);
      if (res.success) {
        toast.success(res.message);
        return;
      }
      toast.error(res.message);
    }

    // Direct clean 58mm thermal print via isolated iframe (never blank!)
    printAgentHisabViaSystem(data);
  };

  // Open slip for specific market
  const handleOpenSlip = (a: AgentSummary, marketId = "all") => {
    setSelectedAgentSlip(a);
    setSelectedSlipMarketId(marketId);
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
                Agent Commission & Payout Khata
                <span className="rounded-md bg-gold/20 border border-gold/40 text-gold font-bold text-xs px-2.5 py-0.5">
                  10% Brokerage + Winnings
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Har bazar ki alag-alag parchi nikaal sakte hain. Parchi par sirf <strong className="text-foreground">Total Sale, Commission, Winning aur Total Amount</strong> hi print hota hai.
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
            <div className="flex items-center gap-3">
              <span>Active Agents: <strong className="text-gold font-bold">{grandTotals.activeAgentsCount}</strong></span>
              <span>•</span>
              <span>House Net Bachat: <strong className={grandTotals.totalHouseProfit >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                {grandTotals.totalHouseProfit >= 0 ? "+" : ""}₹{grandTotals.totalHouseProfit.toLocaleString("en-IN")}
              </strong></span>
            </div>
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

      {/* 2. Top Metric Cards (5 KPI Boxes including Admin Profit/Loss) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Gross Sale */}
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">Gross Sale (Turnover)</span>
            <DollarSign className="h-4 w-4 text-gold" />
          </div>
          <div className="font-mono text-2xl font-black text-foreground">
            ₹{grandTotals.grossSale.toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            From <strong className="text-foreground">{grandTotals.totalPlays}</strong> player bets
          </div>
        </div>

        {/* Card 2: Total Commission (10%) */}
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Commission (10%)</span>
            <Percent className="h-4 w-4" />
          </div>
          <div className="font-mono text-2xl font-black text-emerald-400">
            ₹{grandTotals.totalCommission.toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Agent brokerage cut
          </div>
        </div>

        {/* Card 3: Total Customer Winnings */}
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Winning Claims</span>
            <ArrowDownRight className="h-4 w-4" />
          </div>
          <div className="font-mono text-2xl font-black text-rose-400">
            ₹{grandTotals.totalWinnings.toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Customer winning payouts
          </div>
        </div>

        {/* Card 4: Total Agent Payout */}
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-gold">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Agent Payout</span>
            <Coins className="h-4 w-4 text-gold animate-pulse" />
          </div>
          <div className="font-mono text-2xl font-black text-gold">
            ₹{grandTotals.totalPayableToAgents.toLocaleString("en-IN")}
          </div>
          <div className="text-[10px] font-semibold text-foreground/80 truncate">
            Commission + Winning
          </div>
        </div>

        {/* Card 5: TOTAL ADMIN PROFIT / LOSS (DEDICATED BOX) */}
        <div
          className={`rounded-xl border-2 p-4 shadow-md space-y-1 col-span-2 sm:col-span-1 lg:col-span-1 ${
            grandTotals.totalHouseProfit >= 0
              ? "border-emerald-500/60 bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-card"
              : "border-rose-500/60 bg-gradient-to-br from-rose-500/25 via-rose-500/10 to-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-black uppercase tracking-wider ${
                grandTotals.totalHouseProfit >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {grandTotals.totalHouseProfit >= 0 ? "Admin Profit (बचत)" : "Admin Loss (घाटा)"}
            </span>
            {grandTotals.totalHouseProfit >= 0 ? (
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-5 w-5 text-rose-400" />
            )}
          </div>
          <div
            className={`font-mono text-2xl sm:text-3xl font-black ${
              grandTotals.totalHouseProfit >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {grandTotals.totalHouseProfit >= 0 ? "+" : "-"}₹
            {Math.abs(grandTotals.totalHouseProfit).toLocaleString("en-IN")}
          </div>
          <div
            className={`text-[10px] font-bold ${
              grandTotals.totalHouseProfit >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
            }`}
          >
            {grandTotals.totalHouseProfit >= 0
              ? "Gross Sale me se Payout ke baad bachat"
              : "Payout Gross Sale se zyada hai"}
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
                <th className="p-3">Agent Name & Market Breakdown</th>
                <th className="text-center p-3">Commission %</th>
                <th className="text-right p-3">Total Bet (Sale ₹)</th>
                <th className="text-right p-3 text-emerald-400">Commission (₹)</th>
                <th className="text-right p-3 text-rose-400">Winning (₹)</th>
                <th className="text-right p-3 bg-gold/10 text-gold font-bold">Total Amount (₹)</th>
                <th className="text-right p-3 text-muted-foreground">Admin Profit</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3 pr-4">Actions / Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {agentSummaries.map((a) => {
                const hasBets = a.totalSale > 0;

                return (
                  <tr
                    key={a.id}
                    className={`hover:bg-secondary/40 transition-colors ${
                      a.isSettled ? "opacity-75 bg-background/30" : ""
                    }`}
                  >
                    {/* Agent Name + Market Chips */}
                    <td className="p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold shrink-0 mt-0.5">
                          👤
                        </span>
                        <div className="space-y-1.5">
                          <div>
                            <div className="font-bold text-foreground text-sm flex items-center gap-2">
                              {a.name}
                              {a.isSettled && (
                                <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0.2 font-extrabold">
                                  PAID
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-2">
                              <span>Mob: {a.phone || a.email.replace("@playon.app", "")}</span>
                              <span>•</span>
                              <span>Wallet: <strong className="text-gold">₹{a.walletPoints.toLocaleString("en-IN")}</strong></span>
                            </div>
                          </div>

                          {/* Separate Market Parchi Chips */}
                          {a.marketBreakdowns.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              <span className="text-[10px] font-semibold text-muted-foreground">Parchi:</span>
                              {a.marketBreakdowns.map((mb) => (
                                <button
                                  key={mb.marketId}
                                  type="button"
                                  onClick={() => handleOpenSlip(a, mb.marketId)}
                                  className="rounded bg-secondary/80 hover:bg-gold/20 hover:border-gold/50 border border-border px-1.5 py-0.5 text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                                  title={`Open separate parchi for ${mb.marketName}`}
                                >
                                  <span>{mb.marketName}:</span>
                                  <span className="font-mono text-gold font-bold">₹{mb.totalSale.toLocaleString("en-IN")}</span>
                                  <span className="text-[10px]">🧾</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Commission Rate % */}
                    <td className="p-3 text-center align-top">
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
                    <td className="p-3 text-right align-top">
                      <div className="font-mono font-bold text-foreground text-sm">
                        ₹{a.totalSale.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {a.playCount} {a.playCount === 1 ? "play" : "plays"}
                      </div>
                    </td>

                    {/* Commission Cut */}
                    <td className="p-3 text-right font-mono font-bold text-emerald-400 align-top">
                      ₹{a.totalCommission.toLocaleString("en-IN")}
                    </td>

                    {/* Customer Winning */}
                    <td className="p-3 text-right font-mono font-bold text-rose-400 align-top">
                      ₹{a.totalWinning.toLocaleString("en-IN")}
                    </td>

                    {/* TOTAL AMOUNT */}
                    <td className="p-3 text-right bg-gold/5 align-top">
                      <div className="font-mono text-base font-black text-gold">
                        ₹{a.totalPayableToAgent.toLocaleString("en-IN")}
                      </div>
                      <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wide bg-gold/20 text-gold border border-gold/40">
                        Total Payout
                      </span>
                    </td>

                    {/* Admin Profit (Internal house view only) */}
                    <td className="p-3 text-right align-top">
                      <span className={`font-mono font-semibold ${a.houseNetProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {a.houseNetProfit >= 0 ? "+" : ""}₹{a.houseNetProfit.toLocaleString("en-IN")}
                      </span>
                    </td>

                    {/* Settled / Pending Toggle */}
                    <td className="p-3 text-center align-top">
                      <button
                        type="button"
                        onClick={() => handleToggleSettled(a.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          a.isSettled
                            ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                            : "bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-gold/50"
                        }`}
                      >
                        {a.isSettled ? "✓ Paid" : "⏳ Pending"}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="p-3 pr-4 text-center align-top">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* WhatsApp Share Button */}
                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(a, "all")}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white p-1.5 transition-all shadow-sm cursor-pointer"
                          title="Share Hisab on WhatsApp"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>

                        {/* View Parchi / Receipt */}
                        <button
                          type="button"
                          onClick={() => handleOpenSlip(a, "all")}
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
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
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

      {/* 5. MODAL: MARKET-WISE SEPARATE HISAB SLIP & THERMAL PRINT */}
      {selectedAgentSlip && activeSlipData && (
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
                      Agent Hisab Parchi
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedAgentSlip.name} • {dateLabel}
                    </p>
                  </div>
                </div>

                <PrinterStatusBadge showTextOnMobile={true} />
              </div>
            </DialogHeader>

            {/* Market Switcher Tabs inside Slip Modal */}
            <div className="space-y-1.5 border-b pb-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                <span>Select Bazar / Market for Parchi:</span>
                <span className="text-gold font-bold">{activeSlipData.marketName}</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                <button
                  type="button"
                  onClick={() => setSelectedSlipMarketId("all")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedSlipMarketId === "all"
                      ? "bg-primary text-primary-foreground shadow"
                      : "border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Combined
                </button>
                {selectedAgentSlip.marketBreakdowns.map((mb) => (
                  <button
                    key={mb.marketId}
                    type="button"
                    onClick={() => setSelectedSlipMarketId(mb.marketId)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedSlipMarketId === mb.marketId
                        ? "bg-gold text-slate-950 font-black shadow ring-1 ring-gold"
                        : "border bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {mb.marketName} (₹{mb.totalSale.toLocaleString("en-IN")})
                  </button>
                ))}
              </div>
            </div>

            {/* 58mm Thermal Receipt Visual Container: Pure Hindi Format */}
            <div
              id="printable-agent-slip"
              className="my-3 w-full max-w-[240px] mx-auto p-3 bg-white text-black font-sans text-[11px] rounded-xl shadow-inner border border-dashed border-gray-400 select-all space-y-2"
            >
              {/* Receipt Header */}
              <div className="text-center space-y-0.5 border-b border-dashed border-gray-400 pb-2">
                <div className="text-base font-black tracking-wider">PLAY ON</div>
                <div className="text-[11px] font-bold uppercase text-gray-800">एजेंट हिसाब पर्ची</div>
                <div className="text-[10px] text-gray-600">दिनांक: {dateLabel}</div>
              </div>

              {/* Agent & Market Info */}
              <div className="space-y-1 text-[11px] border-b border-dashed border-gray-400 pb-2">
                <div className="flex justify-between font-bold">
                  <span>एजेंट:</span>
                  <span>{selectedAgentSlip.name}</span>
                </div>
                {selectedAgentSlip.phone && (
                  <div className="flex justify-between text-gray-600 text-[10px]">
                    <span>मोबाइल:</span>
                    <span>{selectedAgentSlip.phone}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-800">
                  <span>बाजार:</span>
                  <span className="max-w-[120px] truncate">{activeSlipData.marketName}</span>
                </div>
                <div className="flex justify-between text-gray-600 text-[10px]">
                  <span>कुल दांव:</span>
                  <span>{activeSlipData.playCount} दांव</span>
                </div>
              </div>

              {/* Breakdown Ledger Table */}
              <div className="space-y-1.5 text-xs py-1 border-b border-dashed border-gray-400 pb-2">
                <div className="flex justify-between font-bold text-gray-800">
                  <span>कुल बिक्री (धंदा):</span>
                  <span>₹{activeSlipData.totalSale.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>कमीशन ({activeSlipData.commissionRate}%):</span>
                  <span>₹{activeSlipData.totalCommission.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>विनिंग रकम:</span>
                  <span>₹{activeSlipData.totalWinning.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* CLEAN TOTAL AMOUNT BOX: No "Admin Profit", No "Total Agent ko Dena" phrase */}
              <div className="p-2.5 bg-gray-100 rounded-lg space-y-0.5 text-center border border-gray-400">
                <div className="text-[10px] font-bold text-gray-700">
                  कुल देय रकम (TOTAL)
                </div>
                <div className="text-xl font-black text-gray-900">
                  ₹{activeSlipData.totalPayableToAgent.toLocaleString("en-IN")}
                </div>
              </div>

              {/* Footer: Clean and simple */}
              <div className="text-[9.5px] text-gray-600 pt-1 text-center">
                *** धन्यवाद — PLAY ON ***
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
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
                onClick={() => handleShareWhatsApp(selectedAgentSlip, selectedSlipMarketId)}
              >
                <Share2 className="h-3.5 w-3.5" />
                WhatsApp
              </Button>

              <Button
                size="sm"
                disabled={isPrintingThermal}
                className="flex-1 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground font-bold shadow hover:bg-primary/90"
                onClick={handleThermalPrint}
              >
                <Printer className="h-3.5 w-3.5" />
                {isPrintingThermal ? "Printing…" : "Thermal Print"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => printViaSystem()}
                title="Print via Android System / Browser Print Service"
              >
                System Print
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
