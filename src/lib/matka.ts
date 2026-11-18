export const pannaDigit = (p?: string | null) =>
  p && /^\d{3}$/.test(p) ? String(p.split("").reduce((a, c) => a + +c, 0) % 10) : null;

export function resultLabel(open?: string | null, close?: string | null) {
  const od = pannaDigit(open);
  const cd = pannaDigit(close);
  return `${open ?? "***"}-${od ?? "*"}${cd ?? "*"}-${close ?? "***"}`;
}

// parts: digit-length of each piece; pieces are joined with "-".
// closeOnly: game is decided at close and must be played before the open result.
export const GAMES = {
  single: { label: "Single Digit", parts: [1], partLabels: ["Digit"], rate: 9, closeOnly: false, legacy: true },
  ank_bulk: { label: "Single Digit", parts: [1], partLabels: ["Digit"], rate: 9, closeOnly: false, isBulk: true },
  jodi: { label: "Jodi", parts: [2], partLabels: ["Jodi"], rate: 90, closeOnly: true, legacy: true },
  jodi_bulk: { label: "Jodi", parts: [2], partLabels: ["Jodi"], rate: 90, closeOnly: true, isBulk: true },
  family_jodi: { label: "Jodi Family", parts: [2], partLabels: ["Jodi"], rate: 90, closeOnly: true, isBulk: true },
  single_panna: { label: "Single Panna", parts: [3], partLabels: ["Panna (3 different digits)"], rate: 140, closeOnly: false },
  double_panna: { label: "Double Panna", parts: [3], partLabels: ["Panna (two same digits)"], rate: 280, closeOnly: false },
  triple_panna: { label: "Triple Panna", parts: [3], partLabels: ["Panna (all same digits)"], rate: 600, closeOnly: false },
  family_panna: { label: "Family Panna", parts: [3], partLabels: ["Panna"], rate: 140, closeOnly: false, isBulk: true },
  half_sangam: { label: "Half Sangam", parts: [1, 3], partLabels: ["Open digit", "Close panna"], rate: 1000, closeOnly: true },
  full_sangam: { label: "Full Sangam", parts: [3, 3], partLabels: ["Open panna", "Close panna"], rate: 10000, closeOnly: true },
  panna: { label: "Panna", parts: [3], partLabels: ["Panna"], rate: 140, closeOnly: false, legacy: true },
} as const;
export type GameType = keyof typeof GAMES;
export const PLAYABLE = (Object.keys(GAMES) as GameType[]).filter((k) => !("legacy" in GAMES[k]));

export const gameLabel = (g: string) => GAMES[g as GameType]?.label ?? g;

export const fmtTime = (t?: string | null) => {
  if (!t || typeof t !== "string") return "--:--";
  const parts = t.split(":");
  if (parts.length < 2) return t;
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
};

// All play times are shown in Indian time (IST), no matter the device's timezone.
const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});
export const fmtIST = (iso?: string | null): string => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return istDateTime.format(d);
  } catch {
    return "—";
  }
};

const istDateOnly = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
export const toISTDateString = (isoOrDate?: string | Date | null): string => {
  if (!isoOrDate) return "";
  try {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return "";
    return istDateOnly.format(d);
  } catch {
    return "";
  }
};

// Markets auto open and close on their own times, in IST (India time).
export const istHHMM = () => {
  const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 330) * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const toMin = (t?: string | null) => {
  if (!t || typeof t !== "string") return 0;
  const [h = 0, m = 0] = t.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

// 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MarketScheduleInfo {
  openDays: DayOfWeek[];
  label: string; // e.g. "Mon - Sat"
}

// Industry Standard Satta Matka Operating Days (Verified with official Mumbai/Kalyan boards)
export const DEFAULT_MARKET_SCHEDULES: Record<string, MarketScheduleInfo> = {
  // Mon - Sat (Sunday OFF)
  KALYAN: { openDays: [1, 2, 3, 4, 5, 6], label: "Mon - Sat" },
  "TIME BAZAR": { openDays: [1, 2, 3, 4, 5, 6], label: "Mon - Sat" },
  "KALYAN NIGHT": { openDays: [1, 2, 3, 4, 5, 6], label: "Mon - Sat" },
  "KALYAN MORNING": { openDays: [1, 2, 3, 4, 5, 6], label: "Mon - Sat" },

  // Mon - Fri (Saturday & Sunday OFF)
  "MAIN BAZAR": { openDays: [1, 2, 3, 4, 5], label: "Mon - Fri" },
  "RAJDHANI DAY": { openDays: [1, 2, 3, 4, 5], label: "Mon - Fri" },
  "RAJDHANI NIGHT": { openDays: [1, 2, 3, 4, 5], label: "Mon - Fri" },

  // 7 Days (Mon - Sun)
  SRIDEVI: { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "SRIDEVI NIGHT": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "MADHUR DAY": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "MADHUR NIGHT": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "MILAN DAY": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "MILAN NIGHT": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "MILAN MORNING": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  PADMAVATI: { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  PADMAVATHI: { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "PADMAVATI NIGHT": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "PADMAVATHI NIGHT": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "SUPREME DAY": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
  "SUPREME NIGHT": { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" },
};

export function getISTDayOfWeek(): DayOfWeek {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  const map: Record<string, DayOfWeek> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? (now.getDay() as DayOfWeek);
}

export function isMarketScheduledToday(marketName?: string | null): {
  isRunningToday: boolean;
  reason?: string | undefined;
  scheduleLabel: string;
  currentDayName: string;
} {
  const clean = (marketName || "").trim().toUpperCase();
  let sched = DEFAULT_MARKET_SCHEDULES[clean];
  if (!sched) {
    if (clean.includes("MAIN BAZAR") || clean.includes("RAJDHANI")) {
      sched = { openDays: [1, 2, 3, 4, 5], label: "Mon - Fri" };
    } else if (clean.includes("KALYAN") || clean.includes("TIME BAZAR")) {
      sched = { openDays: [1, 2, 3, 4, 5, 6], label: "Mon - Sat" };
    } else {
      sched = { openDays: [0, 1, 2, 3, 4, 5, 6], label: "7 Days" };
    }
  }

  const istDay = getISTDayOfWeek();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDayName = dayNames[istDay] || "Today";
  const isRunning = sched.openDays.includes(istDay);

  return {
    isRunningToday: isRunning,
    reason: isRunning ? undefined : `Closed on ${currentDayName} (${sched.label})`,
    scheduleLabel: sched.label,
    currentDayName,
  };
}

// 10-Minute Buffer Rule: Booking counters close strictly 10 minutes before actual result declaration
export const BUFFER_MINUTES = 10;

// Official DPBoss live market operating timings
export const OFFICIAL_MARKET_TIMINGS: Record<string, { open_time: string; close_time: string }> = {
  "MILAN MORNING": { open_time: "10:30:00", close_time: "11:30:00" },
  SRIDEVI: { open_time: "11:35:00", close_time: "12:35:00" },
  PADMAVATI: { open_time: "11:40:00", close_time: "12:40:00" },
  PADMAVATHI: { open_time: "11:40:00", close_time: "12:40:00" },
  "KALYAN MORNING": { open_time: "11:59:00", close_time: "12:59:00" },
  "TIME BAZAR": { open_time: "13:05:00", close_time: "14:05:00" },
  "MADHUR DAY": { open_time: "13:30:00", close_time: "14:30:00" },
  "MILAN DAY": { open_time: "15:05:00", close_time: "17:05:00" },
  "RAJDHANI DAY": { open_time: "15:15:00", close_time: "17:15:00" },
  KALYAN: { open_time: "15:45:00", close_time: "17:45:00" },
  "SRIDEVI NIGHT": { open_time: "19:15:00", close_time: "20:15:00" },
  "PADMAVATI NIGHT": { open_time: "19:45:00", close_time: "20:45:00" },
  "PADMAVATHI NIGHT": { open_time: "19:45:00", close_time: "20:45:00" },
  "MADHUR NIGHT": { open_time: "20:30:00", close_time: "22:30:00" },
  "MILAN NIGHT": { open_time: "21:05:00", close_time: "23:05:00" },
  "RAJDHANI NIGHT": { open_time: "21:35:00", close_time: "23:45:00" },
  "KALYAN NIGHT": { open_time: "21:40:00", close_time: "23:40:00" },
  "MAIN BAZAR": { open_time: "22:00:00", close_time: "00:10:00" },
};

export function getEffectiveTimes(m: { name?: string; open_time?: string; close_time?: string }) {
  const clean = (m.name || "").trim().toUpperCase();
  const official = OFFICIAL_MARKET_TIMINGS[clean];
  return {
    open_time: official?.open_time || m.open_time || "10:00:00",
    close_time: official?.close_time || m.close_time || "11:00:00",
  };
}

export function getCutoffMinutes(timeMinutes: number, buffer: number = BUFFER_MINUTES): number {
  let c = timeMinutes - buffer;
  if (c < 0) c += 24 * 60;
  return c;
}

export function fmtBookingClose(t?: string | null, buffer: number = BUFFER_MINUTES): string {
  if (!t || typeof t !== "string") return "--:--";
  const parts = t.split(":");
  if (parts.length < 2) return t;
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const totalMin = h * 60 + m;
  let closeMin = totalMin - buffer;
  if (closeMin < 0) closeMin += 24 * 60;
  const ch = Math.floor(closeMin / 60) % 24;
  const cm = closeMin % 60;
  const ap = ch >= 12 ? "PM" : "AM";
  return `${((ch + 11) % 12) + 1}:${String(cm).padStart(2, "0")} ${ap}`;
}

export function isOpenPast(m: { name?: string; open_time: string; close_time: string; open_panna?: string | null }) {
  if (m.name && !isMarketScheduledToday(m.name).isRunningToday) return true;
  // If open result was declared today
  if (canMarketDeclareOpen(m) && m.open_panna) return true;

  const eff = getEffectiveTimes(m);
  const nowM = toMin(istHHMM());
  const openM = toMin(eff.open_time);
  const closeM = toMin(eff.close_time);
  const isCross = closeM <= openM;
  const openCutoff = getCutoffMinutes(openM, BUFFER_MINUTES);

  if (!isCross) {
    // Normal daytime market: booking closes at (open_time - 10 min)
    return nowM >= openCutoff;
  } else {
    // Overnight market (e.g. 22:00 to 00:10): booking closes at 21:50, stays closed through night window < 360 (06:00 AM)
    return nowM >= openCutoff || nowM < 360;
  }
}

export function isClosePast(m: { name?: string; open_time: string; close_time: string; close_panna?: string | null }) {
  if (m.name && !isMarketScheduledToday(m.name).isRunningToday) return true;
  // If close result was declared today
  if (canMarketDeclareOpen(m) && m.close_panna) return true;

  const eff = getEffectiveTimes(m);
  const nowM = toMin(istHHMM());
  const openM = toMin(eff.open_time);
  const closeM = toMin(eff.close_time);
  const isCross = closeM <= openM;
  const closeCutoff = getCutoffMinutes(closeM, BUFFER_MINUTES);

  if (!isCross) {
    // Normal daytime market: booking closes at (close_time - 10 min)
    return nowM >= closeCutoff;
  } else {
    // Overnight market: booking closes at (close_time - 10 min) and remains closed until 06:00 AM
    if (closeCutoff < openM) {
      // e.g. Close 00:10 -> closeCutoff 00:00 (0m)
      return nowM >= closeCutoff && nowM < 360;
    } else {
      // e.g. Close 23:55 -> closeCutoff 23:45
      return nowM >= closeCutoff || nowM < 360;
    }
  }
}

export type MarketState = "open" | "closed";
export function marketStatus(m: {
  active: boolean;
  name?: string;
  open_time: string;
  close_time: string;
  open_panna?: string | null;
  close_panna?: string | null;
}) {
  if (!m.active) return { state: "closed" as MarketState, note: "Closed (Off)" };

  // 1. Weekly Schedule Guard (e.g. Kalyan closed on Sunday)
  if (m.name) {
    const sched = isMarketScheduledToday(m.name);
    if (!sched.isRunningToday) {
      return { state: "closed" as MarketState, note: sched.reason || "Closed Today" };
    }
  }

  // 2. Has close counter passed or close declared? Entire market closed for today
  if (isClosePast(m)) {
    return { state: "closed" as MarketState, note: "Closed for today" };
  }

  // 3. Has open counter passed or open declared? Open is closed, but Close session is open
  if (isOpenPast(m)) {
    return { state: "open" as MarketState, note: "Open (Close Session)" };
  }

  // 4. Before open cutoff -> Market is open for both Open & Close sessions (including Jodi/Sangam)
  return { state: "open" as MarketState, note: "Open for Play" };
}

/**
 * Check whether a market is currently open for play/betting (used for players on Home/Play pages).
 */
export function isMarketOpen(m: {
  active: boolean;
  name?: string;
  open_time: string;
  close_time: string;
  open_panna?: string | null;
  close_panna?: string | null;
}): boolean {
  if (!m.active) return false;
  if (m.name && !isMarketScheduledToday(m.name).isRunningToday) return false;
  const canOpen = canMarketDeclareOpen(m);
  const displayClose = canOpen ? m.close_panna : null;
  if (displayClose) return false;
  const st = marketStatus(m);
  return st.state === "open";
}

/**
 * Check whether a market is active/open in Admin (pending action, live play, or close declaration).
 * Markets that have Full Day Declared or are switched off return false.
 */
export function isMarketOpenForAdmin(m: {
  active: boolean;
  name?: string;
  open_time: string;
  close_time: string;
  open_panna?: string | null;
  close_panna?: string | null;
}): boolean {
  if (!m.active) return false;
  if (m.name && !isMarketScheduledToday(m.name).isRunningToday) return false;
  const canOpen = canMarketDeclareOpen(m);
  // If open time arrived today and close_panna is declared, it is Full Day Declared (closed)
  if (canOpen && m.close_panna) return false;
  // Overnight market during post-close night window
  const nowM = toMin(istHHMM());
  const oM = toMin(m.open_time);
  const cM = toMin(m.close_time);
  if (cM < oM && nowM >= cM && nowM < 360) {
    return false;
  }
  return true;
}

/**
 * Sort markets for players: Open markets at the top, Closed markets at the bottom.
 * Preserves relative sort_order within each group.
 */
export function sortMarketsForPlayer<T extends {
  active: boolean;
  name?: string;
  open_time: string;
  close_time: string;
  open_panna?: string | null;
  close_panna?: string | null;
  sort_order?: number | null;
}>(markets: T[]): T[] {
  return [...markets].sort((a, b) => {
    const aOpen = isMarketOpen(a);
    const bOpen = isMarketOpen(b);
    if (aOpen !== bOpen) {
      return aOpen ? -1 : 1;
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

/**
 * Sort markets for admin: Running/pending markets at the top, Full Day Declared/Inactive at the bottom.
 * Preserves relative sort_order within each group.
 */
export function sortMarketsForAdmin<T extends {
  active: boolean;
  name?: string;
  open_time: string;
  close_time: string;
  open_panna?: string | null;
  close_panna?: string | null;
  sort_order?: number | null;
}>(markets: T[]): T[] {
  return [...markets].sort((a, b) => {
    const aOpen = isMarketOpenForAdmin(a);
    const bOpen = isMarketOpenForAdmin(b);
    if (aOpen !== bOpen) {
      return aOpen ? -1 : 1;
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

// Check whether market's open session time has actually arrived today in IST
export function canMarketDeclareOpen(m: { open_time: string; close_time: string; name?: string }) {
  if (m.name && !isMarketScheduledToday(m.name).isRunningToday) return false;
  const eff = getEffectiveTimes(m);
  const nowM = toMin(istHHMM());
  const oM = toMin(eff.open_time);
  const cM = toMin(eff.close_time);
  if (cM > oM) {
    return nowM >= oM;
  } else {
    // Overnight market (e.g. 21:40 to 00:05)
    return nowM >= oM || nowM < cM;
  }
}

// Check whether market's close session time has actually arrived today in IST
export function canMarketDeclareClose(m: { open_time: string; close_time: string; open_panna?: string | null; name?: string }) {
  if (m.name && !isMarketScheduledToday(m.name).isRunningToday) return false;
  if (!m.open_panna) return false; // Open result must be declared before close
  const eff = getEffectiveTimes(m);
  const nowM = toMin(istHHMM());
  const oM = toMin(eff.open_time);
  const cM = toMin(eff.close_time);
  if (cM > oM) {
    return nowM >= cM;
  } else {
    // Overnight market: close is after midnight (e.g. 00:05)
    return nowM >= cM && nowM < 360;
  }
}

// Get player display name for receipts (avoids printing emails or 10-digit mobile numbers)
export function getPlayerDisplayName(
  user?: { email?: string | null; user_metadata?: Record<string, any> } | null,
  profile?: { display_name?: string | null } | null
): string {
  // 1. Saved custom player name from local storage
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("preferred_player_name")?.trim();
    if (saved && saved.length > 0) return saved;
  }

  // 2. User metadata from auth signup (display_name, full_name, name)
  const meta = user?.user_metadata;
  const metaName = (meta?.["display_name"] || meta?.["full_name"] || meta?.["name"])?.toString().trim();
  if (metaName && !metaName.includes("@") && !/^\d{10}$/.test(metaName)) {
    return metaName;
  }

  // 3. Profile display_name
  const profName = profile?.display_name?.toString().trim();
  if (profName && !profName.includes("@") && !/^\d{10}$/.test(profName)) {
    return profName;
  }

  // 4. If metaName or profName exists but has email or special characters
  const candidate = metaName || profName || "";
  if (candidate) {
    if (candidate.includes("@")) {
      const part = candidate.split("@")[0]?.trim();
      if (part && !/^\d+$/.test(part)) return part;
    } else if (!/^\d{10}$/.test(candidate)) {
      return candidate;
    }
  }

  // 5. Fallback from email prefix if it's not purely a phone number
  if (user?.email) {
    const part = user.email.split("@")[0]?.trim();
    if (part && !/^\d+$/.test(part)) {
      return part;
    }
  }

  return "Player";
}



