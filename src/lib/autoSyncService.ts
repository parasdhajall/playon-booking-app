import { supabase } from "@/integrations/supabase/client";
import { fetchRsbossLiveResults, type MarketLiveResult } from "./rsbossFetcher";

let isWorkerStarted = false;
let lastResetDateStr: string = "";
let isSyncRunning = false;

// Get current date string in Indian Standard Time (YYYY-MM-DD)
function getISTDateString(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  return ist.toISOString().split("T")[0]!;
}

// Get current IST hour and minute
function getISTHourMinute(): { hour: number; minute: number } {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  return { hour: ist.getHours(), minute: ist.getMinutes() };
}

/**
 * 1. 4:00 AM IST Daily Reset Check
 * Resets all market pannas and refunds stale previous-day bets daily at or after 4:00 AM IST.
 */
export async function perform4AMResetCheck(force = false): Promise<{ executed: boolean; message: string; data?: any }> {
  try {
    const todayIST = getISTDateString();
    const { hour } = getISTHourMinute();

    // Check if it's 4:00 AM IST or later, and hasn't been run for today's date yet
    if (!force) {
      if (hour < 4) {
        return { executed: false, message: `Current IST hour is ${hour}. Reset runs at 04:00 AM IST.` };
      }
      if (lastResetDateStr === todayIST) {
        return { executed: false, message: `4:00 AM reset already executed for ${todayIST}.` };
      }
    }

    console.log(`[4:00 AM RESET] Executing daily market reset for date ${todayIST}...`);
    const { data, error } = await supabase.rpc("system_reset_at_4am" as any);

    if (error) {
      console.error("[4:00 AM RESET] RPC error:", error);
      return { executed: false, message: error.message };
    }

    lastResetDateStr = todayIST;
    console.log(`[4:00 AM RESET] Success:`, data);
    return { executed: true, message: `Daily reset completed at 4:00 AM IST for ${todayIST}`, data };
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
  declaredCount: number;
  details: string[];
  error?: string;
}> {
  if (isSyncRunning) {
    return { success: false, declaredCount: 0, details: ["Sync already in progress, skipping"] };
  }

  isSyncRunning = true;
  const details: string[] = [];
  let declaredCount = 0;

  try {
    // 1. Fetch live published results from DPBoss / RSBoss
    const fetchRes = await fetchRsbossLiveResults();
    if (!fetchRes.success || !fetchRes.results) {
      return { success: false, declaredCount: 0, details: [fetchRes.error || "No live results fetched"] };
    }

    const liveResults = fetchRes.results;

    // 2. Fetch current database markets
    const { data: markets, error: mErr } = await supabase.from("markets").select("*");
    if (mErr || !markets) {
      return { success: false, declaredCount: 0, details: [mErr?.message || "Could not fetch markets"] };
    }

    // 3. Match and declare
    for (const m of markets) {
      const live = liveResults[m.name.toUpperCase().trim()];
      if (!live) continue;

      // Check Open Panna: DPBoss has open panna, but our market in DB does not
      if (live.openPanna && !m.open_panna) {
        try {
          console.log(`[AUTO-DECLARE] Declaring ${m.name} OPEN: ${live.openPanna}`);
          const { data, error } = await supabase.rpc("system_auto_declare_result" as any, {
            _market: m.id,
            _session: "open",
            _panna: live.openPanna,
          });

          if (!error) {
            declaredCount++;
            details.push(`${m.name} OPEN -> ${live.openPanna}`);
            m.open_panna = live.openPanna; // update local ref
          } else {
            console.warn(`[AUTO-DECLARE] ${m.name} OPEN error:`, error.message);
          }
        } catch (e: any) {
          console.error(`[AUTO-DECLARE] Failed ${m.name} OPEN:`, e.message);
        }
      }

      // Check Close Panna: DPBoss has close panna, our market in DB has open but not close
      if (live.closePanna && !m.close_panna && m.open_panna) {
        try {
          console.log(`[AUTO-DECLARE] Declaring ${m.name} CLOSE: ${live.closePanna}`);
          const { data, error } = await supabase.rpc("system_auto_declare_result" as any, {
            _market: m.id,
            _session: "close",
            _panna: live.closePanna,
          });

          if (!error) {
            declaredCount++;
            details.push(`${m.name} CLOSE -> ${live.closePanna}`);
            m.close_panna = live.closePanna;
          } else {
            console.warn(`[AUTO-DECLARE] ${m.name} CLOSE error:`, error.message);
          }
        } catch (e: any) {
          console.error(`[AUTO-DECLARE] Failed ${m.name} CLOSE:`, e.message);
        }
      }
    }

    return { success: true, declaredCount, details };
  } catch (err: any) {
    console.error("[AUTO-DECLARE] Cycle error:", err);
    return { success: false, declaredCount, details, error: err?.message };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * 3. 24/7 Background Daemon / Worker
 * Starts once when the server boots. Runs every 60 seconds.
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
      // 1. Check if 4:00 AM reset is due
      await perform4AMResetCheck();
      // 2. Check if any results are ready to be declared
      await performAutoDeclareCheck();
    } catch (e) {
      console.error("[SERVER CRON] Worker tick error:", e);
    }
  }, 60000); // 60 seconds
}

/**
 * 4. HTTP API Request Handler for external crons (Vercel Cron / cron-job.org)
 */
export async function handleCronApiRequest(url: URL): Promise<Response | null> {
  const pathname = url.pathname;

  if (pathname === "/api/cron/auto-declare" || pathname === "/api/cron/sync-results") {
    const [resetRes, declareRes] = await Promise.all([
      perform4AMResetCheck(),
      performAutoDeclareCheck(),
    ]);

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        reset_4am: resetRes,
        auto_declare: declareRes,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }

  if (pathname === "/api/cron/reset-4am") {
    const result = await perform4AMResetCheck(true);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return null;
}
