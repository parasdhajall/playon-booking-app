import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchLiveResultsDirect, type MarketLiveResult } from "./rsbossFetcher";
import { canMarketDeclareOpen, canMarketDeclareClose, isMarketScheduledToday } from "./matka";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ||
  process.env["VITE_SUPABASE_URL"] ||
  "https://nrgmrfjubqghzqfdqacc.supabase.co";

const SUPABASE_KEY =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  "sb_publishable_3EYSXyl-YJJL5eBWJ44Tug_VxpUre_A";

const ADMIN_EMAIL = process.env["ADMIN_EMAIL"] || "admin@playon.com";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] || "Password123!";

let adminClientInstance: SupabaseClient | null = null;
let sessionExpiresAt = 0;
let isWorkerStarted = false;
let lastResetDateStr: string = "";
let isSyncRunning = false;
let lastBackgroundTrafficCheck = 0;
let lastDeclaredSummary: Array<{ market: string; session: string; panna: string; time: string }> = [];

// Get authenticated Supabase client using authorized Admin credentials
export async function getAdminClient(): Promise<SupabaseClient> {
  const nowSec = Math.floor(Date.now() / 1000);

  if (adminClientInstance && sessionExpiresAt > nowSec + 300) {
    return adminClientInstance;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    if (error || !data.session) {
      console.error("[AutoSync] Admin sign-in failed:", error?.message || "No session");
      return client;
    }

    sessionExpiresAt = data.session.expires_at || nowSec + 3600;
    adminClientInstance = client;
    return adminClientInstance;
  } catch (err: any) {
    console.error("[AutoSync] Exception in getAdminClient:", err?.message);
    return client;
  }
}

// Get current date string in Indian Standard Time (YYYY-MM-DD)
export function getISTDateString(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

// Get current IST hour and minute
export function getISTHourMinute(): { hour: number; minute: number; str: string } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return { hour, minute, str: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

/**
 * 1. 4:00 AM IST Daily Reset
 * Resets all market pannas and refunds stale previous-day bets daily at or after 4:00 AM IST.
 */
export async function perform4AMResetCheck(force = false): Promise<{
  executed: boolean;
  message: string;
  resetDate?: string;
  resetCount?: number;
  markets?: string[];
}> {
  try {
    const todayIST = getISTDateString();
    const { hour, str } = getISTHourMinute();

    // Check if it's 4:00 AM IST or later, and hasn't run for today yet
    if (!force) {
      if (hour < 4) {
        return { executed: false, message: `Current IST time is ${str}. Daily reset runs at or after 04:00 AM IST.` };
      }
      if (lastResetDateStr === todayIST) {
        return { executed: false, message: `Daily reset already executed for ${todayIST}.` };
      }
    }

    console.log(`[4:00 AM RESET] Starting daily market reset for date ${todayIST} at ${str} IST...`);
    const client = await getAdminClient();

    // Query markets that currently have results declared from yesterday
    const { data: markets, error: mErr } = await client
      .from("markets")
      .select("id, name, open_panna, close_panna")
      .or("open_panna.not.is.null,close_panna.not.is.null");

    if (mErr) {
      console.error("[4:00 AM RESET] Failed to query markets:", mErr.message);
      return { executed: false, message: mErr.message };
    }

    const resetNames: string[] = [];
    for (const m of markets || []) {
      try {
        const { error: rErr } = await client.rpc("reset_market", { _market: m.id });
        if (!rErr) {
          resetNames.push(m.name);
        } else {
          console.warn(`[4:00 AM RESET] Market ${m.name} reset warning:`, rErr.message);
        }
      } catch (err: any) {
        console.warn(`[4:00 AM RESET] Market ${m.name} reset exception:`, err?.message);
      }
    }

    // Call auto_reset_stale_markets as final cleanup
    try {
      await client.rpc("auto_reset_stale_markets");
    } catch {}

    lastResetDateStr = todayIST;
    console.log(`[4:00 AM RESET] Successfully reset ${resetNames.length} markets for ${todayIST}`);

    return {
      executed: true,
      message: `Daily reset completed at ${str} IST for ${todayIST}. Reset ${resetNames.length} markets.`,
      resetDate: todayIST,
      resetCount: resetNames.length,
      markets: resetNames,
    };
  } catch (err: any) {
    console.error("[4:00 AM RESET] Error:", err);
    return { executed: false, message: err?.message || "Unknown reset error" };
  }
}

/**
 * 2. Background Auto-Declare Results Check
 * Scrapes DPBoss/RSBoss live results and automatically declares any undeclared markets without admin UI.
 */
export async function performAutoDeclareCheck(): Promise<{
  success: boolean;
  timestamp: string;
  source: string;
  declaredCount: number;
  details: string[];
  error?: string;
}> {
  if (isSyncRunning) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      source: "locked",
      declaredCount: 0,
      details: ["Sync already in progress, skipping duplicate cycle"],
    };
  }

  isSyncRunning = true;
  const nowIso = new Date().toISOString();
  const details: string[] = [];
  let declaredCount = 0;

  try {
    const client = await getAdminClient();

    // 1. First self-heal/reset any stale markets from previous day
    try {
      await client.rpc("auto_reset_stale_markets");
    } catch {}

    // 2. Fetch live published results from DPBoss / RSBoss
    const fetchRes = await fetchLiveResultsDirect();
    if (!fetchRes.success || !fetchRes.results) {
      return {
        success: false,
        timestamp: nowIso,
        source: fetchRes.source,
        declaredCount: 0,
        details: [fetchRes.error || "No live results fetched"],
      };
    }

    const liveResults = fetchRes.results;

    // 3. Fetch active database markets
    const { data: markets, error: mErr } = await client
      .from("markets")
      .select("id, name, open_time, close_time, open_panna, close_panna, active")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (mErr || !markets) {
      return {
        success: false,
        timestamp: nowIso,
        source: fetchRes.source,
        declaredCount: 0,
        details: [mErr?.message || "Could not fetch markets"],
      };
    }

    // 4. Match and declare
    for (const m of markets) {
      // Guard: skip if market is not scheduled today (e.g. Sunday schedule)
      const sched = isMarketScheduledToday(m.name);
      if (!sched.isRunningToday) continue;

      const live = liveResults[m.name.toUpperCase().trim()];
      if (!live) continue;

      // Condition A: Declare OPEN result
      if (!m.open_panna && canMarketDeclareOpen(m) && live.openPanna && /^[0-9]{3}$/.test(live.openPanna)) {
        try {
          console.log(`[AUTO-DECLARE] Declaring ${m.name} OPEN: ${live.openPanna}`);
          const { error: decErr } = await client.rpc("declare_result", {
            _market: m.id,
            _session: "open",
            _panna: live.openPanna,
          });

          if (!decErr) {
            declaredCount++;
            details.push(`${m.name} OPEN -> ${live.openPanna}`);
            lastDeclaredSummary.unshift({
              market: m.name,
              session: "open",
              panna: live.openPanna,
              time: nowIso,
            });
            m.open_panna = live.openPanna; // update local ref
          } else {
            console.warn(`[AUTO-DECLARE] ${m.name} OPEN error:`, decErr.message);
          }
        } catch (e: any) {
          console.error(`[AUTO-DECLARE] Failed ${m.name} OPEN:`, e.message);
        }
      }

      // Condition B: Declare CLOSE result
      if (m.open_panna && !m.close_panna && canMarketDeclareClose(m) && live.closePanna && /^[0-9]{3}$/.test(live.closePanna)) {
        try {
          console.log(`[AUTO-DECLARE] Declaring ${m.name} CLOSE: ${live.closePanna}`);
          const { error: decErr } = await client.rpc("declare_result", {
            _market: m.id,
            _session: "close",
            _panna: live.closePanna,
          });

          if (!decErr) {
            declaredCount++;
            details.push(`${m.name} CLOSE -> ${live.closePanna}`);
            lastDeclaredSummary.unshift({
              market: m.name,
              session: "close",
              panna: live.closePanna,
              time: nowIso,
            });
            m.close_panna = live.closePanna;
          } else {
            console.warn(`[AUTO-DECLARE] ${m.name} CLOSE error:`, decErr.message);
          }
        } catch (e: any) {
          console.error(`[AUTO-DECLARE] Failed ${m.name} CLOSE:`, e.message);
        }
      }
    }

    lastDeclaredSummary = lastDeclaredSummary.slice(0, 30);
    return {
      success: true,
      timestamp: nowIso,
      source: fetchRes.source,
      declaredCount,
      details,
    };
  } catch (err: any) {
    console.error("[AUTO-DECLARE] Cycle error:", err);
    return {
      success: false,
      timestamp: nowIso,
      source: "error",
      declaredCount,
      details,
      error: err?.message,
    };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * 3. Traffic-Triggered Background Sync
 * Automatically fires every 60 seconds whenever any player visits or opens the app.
 * Keeps results fresh and guarantees 4:00 AM reset without admin ever opening admin panel.
 */
export function triggerBackgroundTrafficSync() {
  const now = Date.now();
  if (now - lastBackgroundTrafficCheck < 60000 || isSyncRunning) {
    return;
  }
  lastBackgroundTrafficCheck = now;

  // Fire and forget in background
  (async () => {
    try {
      await perform4AMResetCheck();
      await performAutoDeclareCheck();
    } catch (e) {
      console.error("[TrafficSync] Background check error:", e);
    }
  })();
}

/**
 * 4. 24/7 Background Daemon / Worker
 * Starts once when the server boots. Runs every 60 seconds in long-running environments.
 */
export function startAutoSyncWorker() {
  if (typeof window !== "undefined") return; // Only runs on server
  if (isWorkerStarted) return;
  isWorkerStarted = true;

  console.log("[SERVER CRON] 24/7 Background Auto-Sync & 4:00 AM Reset Worker started.");

  // Run initial check 5 seconds after server start
  setTimeout(async () => {
    await perform4AMResetCheck();
    await performAutoDeclareCheck();
  }, 5000);

  // Periodic loop every 60 seconds
  setInterval(async () => {
    try {
      await perform4AMResetCheck();
      await performAutoDeclareCheck();
    } catch (e) {
      console.error("[SERVER CRON] Worker tick error:", e);
    }
  }, 60000);
}

/**
 * 5. HTTP API Request Handler for external crons (Vercel Cron / cron-job.org / curl)
 */
export async function handleCronApiRequest(url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  if (pathname === "/api/cron/auto-declare" || pathname === "/api/cron/sync-results") {
    const [resetRes, declareRes] = await Promise.all([
      perform4AMResetCheck(),
      performAutoDeclareCheck(),
    ]);

    return new Response(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          reset_4am: resetRes,
          auto_declare: declareRes,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }

  if (pathname === "/api/cron/reset-4am" || pathname === "/api/cron/daily-reset") {
    const result = await perform4AMResetCheck(true);
    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (pathname === "/api/cron/status") {
    const { str } = getISTHourMinute();
    return new Response(
      JSON.stringify(
        {
          status: "active",
          currentIST: str,
          todayISTDate: getISTDateString(),
          lastResetDateStr,
          recentDeclarations: lastDeclaredSummary,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }

  return null;
}
