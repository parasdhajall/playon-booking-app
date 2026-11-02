// Traditional Khata-Bahi (ऑटोमैटिक खाता बही) Data Engine & Formatters
// Generates Day Shift (Pink Slip) and Night Shift (Blue Slip) traditional records

export type ShiftType = "day" | "night" | "all";

export type TraditionalMarketSessionRow = {
  marketId: string;
  marketName: string;
  hindiName: string;
  session: "open" | "close";
  sessionLabel: string;      // e.g. "श्रीदेवी (ओ)" or "श्रीदेवी (क्)"
  sessionLabelShort: string; // e.g. "SRIDEVI(O)"
  dhanda: number;            // Total bets amount in this session
  suttaWin: number;          // Single digit winning amount
  jentWin: number;           // Jodi winning amount
  pannaWin: number;          // Panna / Patti winning amount
  pannaNote?: string;        // e.g. "10 DP"
  totalWin: number;          // sutta + jent + panna
};

export type TraditionalKhataData = {
  agentId: string;
  agentName: string;
  phone?: string;
  dateStr: string;           // Display date, e.g. "01/11/2026"
  rawDateStr: string;        // YYYY-MM-DD
  shift: ShiftType;
  shiftLabel: string;        // "डे बाजार (DAY SHIFT)" or "नाईट बाजार (NIGHT SHIFT)"
  shiftTheme: "pink" | "blue" | "gold";
  rows: TraditionalMarketSessionRow[];
  totalDhanda: number;       // एकूण धंदा
  commissionRate: number;    // default 10%
  totalCommission: number;   // कमीशन (10% कमी)
  totalWinnings: number;     // कुल विनिंग दावे
  magilNave: number;         // मागील नावे (Previous Balance, +ve = Debit / Dena, -ve = Credit / Jama)
  grossLiability: number;    // एकूण धंदा + मागील नावे
  netFinal: number;          // अंतिम बाकी = grossLiability - commission - totalWinnings
  status: "nave" | "jama";   // "नावे" if netFinal >= 0, "जमा" if netFinal < 0
  statusAmount: number;      // Math.abs(netFinal)
};

export const HINDI_MARKET_NAMES: Record<string, string> = {
  SRIDEVI: "श्रीदेवी",
  "SRIDEVI DAY": "श्रीदेवी डे",
  "SRIDEVI NIGHT": "श्रीदेवी नाईट",
  PADMAVATI: "पद्मावती",
  "PADMAVATI NIGHT": "पद्मावती नाईट",
  "TIME BAZAR": "टाइम बाजार",
  "MADHUR DAY": "मधुर डे",
  "MADHUR NIGHT": "मधुर नाईट",
  "MILAN DAY": "मिलन डे",
  "MILAN NIGHT": "मिलन नाईट",
  "MILAN MORNING": "मिलन मॉर्निंग",
  "KALYAN MORNING": "कल्याण मॉर्निंग",
  "RAJDHANI DAY": "राजधानी डे",
  KALYAN: "कल्याण",
  "KALYAN NIGHT": "कल्याण नाईट",
  "RAJDHANI NIGHT": "राजधानी नाईट",
  "MAIN BAZAR": "मेन बाजार",
  "SUPREME DAY": "सुप्रीम डे",
  "SUPREME NIGHT": "सुप्रीम नाईट",
};

export function getHindiMarketName(rawName: string): string {
  const upper = (rawName || "").trim().toUpperCase();
  if (HINDI_MARKET_NAMES[upper]) return HINDI_MARKET_NAMES[upper];
  for (const [k, v] of Object.entries(HINDI_MARKET_NAMES)) {
    if (upper.includes(k)) return v;
  }
  return rawName;
}

// Automatic Day vs Night Shift classification
export function getMarketShift(marketName: string, closeTime?: string): "day" | "night" {
  const upper = (marketName || "").toUpperCase();
  if (upper.includes("NIGHT") || upper.includes("MAIN BAZAR") || upper.includes("RATRI")) {
    return "night";
  }
  if (upper.includes("DAY") || upper.includes("MORNING") || upper.includes("TIME")) {
    return "day";
  }
  if (closeTime) {
    const [h = 0] = closeTime.split(":").map(Number);
    if (h >= 19 || h < 6) return "night";
  }
  return "day";
}

// Storage helpers for previous balance (मागील नावे)
export function getSavedMagilNave(agentId: string, dateStr: string, shift: ShiftType): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`playon_khata_magil_${agentId}_${dateStr}_${shift}`);
    if (raw !== null) {
      const parsed = Number(raw);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {}
  return null;
}

export function saveMagilNave(agentId: string, dateStr: string, shift: ShiftType, amount: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`playon_khata_magil_${agentId}_${dateStr}_${shift}`, amount.toString());
  } catch {}
}

// Core Engine: Build Traditional Khata Data from agent bets & markets
export function buildTraditionalKhataData(
  agent: {
    id: string;
    name: string;
    phone?: string;
    commissionRate?: number;
    bets: Array<{
      id: string;
      market_id: string;
      game_type: string;
      session: string;
      number: string;
      points: number;
      payout: number;
      status: string;
    }>;
  },
  allMarkets: Array<{ id: string; name: string; close_time?: string; sort_order?: number }>,
  shift: ShiftType,
  dateStrDisplay: string,
  rawDateStr: string,
  manualMagilNave?: number | null
): TraditionalKhataData {
  const commRate = agent.commissionRate ?? 10;
  const marketMap = new Map(allMarkets.map((m) => [m.id, m]));

  // Filter bets based on shift
  const shiftBets = (agent.bets || []).filter((b) => {
    const m = marketMap.get(b.market_id);
    if (!m) return false;
    if (shift === "all") return true;
    const mShift = getMarketShift(m.name, m.close_time);
    return mShift === shift;
  });

  // Group bets by market
  const betsByMarket = new Map<string, typeof shiftBets>();
  for (const b of shiftBets) {
    const arr = betsByMarket.get(b.market_id) || [];
    arr.push(b);
    betsByMarket.set(b.market_id, arr);
  }

  // Build rows for each market (Open & Close)
  const rows: TraditionalMarketSessionRow[] = [];

  // Sort markets by sort_order or order of occurrence
  const activeMarketIds = Array.from(betsByMarket.keys()).sort((a, b) => {
    const ma = marketMap.get(a);
    const mb = marketMap.get(b);
    return (ma?.sort_order ?? 0) - (mb?.sort_order ?? 0);
  });

  for (const mid of activeMarketIds) {
    const m = marketMap.get(mid);
    if (!m) continue;
    const mBets = betsByMarket.get(mid) || [];
    const hindiName = getHindiMarketName(m.name);
    const shortName = m.name.replace(/\s*(DAY|NIGHT|MORNING|BAZAR)\s*/gi, "").trim().slice(0, 8);

    // 1. OPEN SESSION:
    // Open session includes single, single_panna, double_panna, triple_panna where session === 'open'
    const openBets = mBets.filter((b) => b.session === "open" && b.game_type !== "jodi");
    const openDhanda = openBets.reduce((sum, b) => sum + (b.points || 0), 0);
    const openSuttaWin = openBets
      .filter((b) => b.game_type === "single")
      .reduce((sum, b) => sum + (b.payout || 0), 0);
    const openPannaBets = openBets.filter((b) => b.game_type.includes("panna"));
    const openPannaWin = openPannaBets.reduce((sum, b) => sum + (b.payout || 0), 0);
    const openTotalWin = openSuttaWin + openPannaWin;

    // 2. CLOSE SESSION:
    // Close session includes close bets + jodi + sangam
    const closeBets = mBets.filter(
      (b) => b.session === "close" || b.game_type === "jodi" || b.game_type.includes("sangam")
    );
    const closeDhanda = closeBets.reduce((sum, b) => sum + (b.points || 0), 0);
    const closeSuttaWin = closeBets
      .filter((b) => b.game_type === "single")
      .reduce((sum, b) => sum + (b.payout || 0), 0);
    const closeJentWin = closeBets
      .filter((b) => b.game_type === "jodi")
      .reduce((sum, b) => sum + (b.payout || 0), 0);
    const closePannaBets = closeBets.filter((b) => b.game_type.includes("panna") || b.game_type.includes("sangam"));
    const closePannaWin = closePannaBets.reduce((sum, b) => sum + (b.payout || 0), 0);
    const closeTotalWin = closeSuttaWin + closeJentWin + closePannaWin;

    // Check if DP winning exists to create an authentic note (e.g. 10 DP)
    let openPannaNote: string | undefined;
    const openDpWin = openBets.find((b) => b.game_type === "double_panna" && b.payout > 0);
    if (openDpWin) {
      openPannaNote = `${openDpWin.points} DP`;
    }

    let closePannaNote: string | undefined;
    const closeDpWin = closeBets.find((b) => b.game_type === "double_panna" && b.payout > 0);
    if (closeDpWin) {
      closePannaNote = `${closeDpWin.points} DP`;
    }

    // Add Open row if there was open activity or if close had activity
    if (openDhanda > 0 || openTotalWin > 0) {
      rows.push({
        marketId: mid,
        marketName: m.name,
        hindiName,
        session: "open",
        sessionLabel: `${hindiName} (ओ)`,
        sessionLabelShort: `${shortName}(O)`,
        dhanda: openDhanda,
        suttaWin: openSuttaWin,
        jentWin: 0,
        pannaWin: openPannaWin,
        pannaNote: openPannaNote,
        totalWin: openTotalWin,
      });
    }

    // Add Close row
    if (closeDhanda > 0 || closeTotalWin > 0) {
      rows.push({
        marketId: mid,
        marketName: m.name,
        hindiName,
        session: "close",
        sessionLabel: `${hindiName} (क्)`,
        sessionLabelShort: `${shortName}(C)`,
        dhanda: closeDhanda,
        suttaWin: closeSuttaWin,
        jentWin: closeJentWin,
        pannaWin: closePannaWin,
        pannaNote: closePannaNote,
        totalWin: closeTotalWin,
      });
    }
  }

  // Summary Totals
  const totalDhanda = rows.reduce((acc, r) => acc + r.dhanda, 0);
  const totalWinnings = rows.reduce((acc, r) => acc + r.totalWin, 0);
  const totalCommission = Math.round(totalDhanda * (commRate / 100));

  // Determine मागील नावे (Previous Balance / Carry-Forward):
  let magilNave = 0;
  if (typeof manualMagilNave === "number") {
    magilNave = manualMagilNave;
  } else {
    // Check saved storage
    const saved = getSavedMagilNave(agent.id, rawDateStr, shift);
    if (saved !== null) {
      magilNave = saved;
    } else if (shift === "night") {
      // Auto carry-forward Day Shift's net final into Night Shift!
      const dayData = buildTraditionalKhataData(agent, allMarkets, "day", dateStrDisplay, rawDateStr, 0);
      magilNave = dayData.netFinal;
    } else {
      magilNave = 0;
    }
  }

  // Financial status:
  // Gross liability = Total Dhanda + (if previous was debit then +magilNave, if previous was credit then -abs(magilNave))
  // i.e. totalDhanda + magilNave
  const grossLiability = totalDhanda + magilNave;
  const netFinal = grossLiability - totalCommission - totalWinnings;
  const status: "nave" | "jama" = netFinal >= 0 ? "nave" : "jama";
  const statusAmount = Math.abs(netFinal);

  const shiftLabel =
    shift === "day"
      ? "डे बाजार (DAY SHIFT)"
      : shift === "night"
        ? "नाईट बाजार (NIGHT SHIFT)"
        : "संपूर्ण दिवस (FULL DAY)";

  const shiftTheme = shift === "day" ? "pink" : shift === "night" ? "blue" : "gold";

  return {
    agentId: agent.id,
    agentName: agent.name,
    phone: agent.phone,
    dateStr: dateStrDisplay,
    rawDateStr,
    shift,
    shiftLabel,
    shiftTheme,
    rows,
    totalDhanda,
    commissionRate: commRate,
    totalCommission,
    totalWinnings,
    magilNave,
    grossLiability,
    netFinal,
    status,
    statusAmount,
  };
}

// 1-Click WhatsApp Message Formatter (Pure Devanagari Traditional Format)
export function generateKhataBahiWhatsAppMessage(data: TraditionalKhataData): string {
  const isPink = data.shift === "day";
  const shiftEmoji = isPink ? "🌸" : data.shift === "night" ? "🔷" : "🌟";
  const statusEmoji = data.status === "nave" ? "🔴" : "🟢";
  const statusText = data.status === "nave" ? "नावे (देनदारी / बाकी)" : "जमा (लेणें / जमा)";

  let msg = `================================\n`;
  msg += `       📖 *PLAYON BOOK*\n`;
  msg += `  दिनांक: ${data.dateStr} | एजेंट: *${data.agentName}*\n`;
  if (data.phone) msg += `  मोबाईल: ${data.phone}\n`;
  msg += `  शिफ्ट: ${shiftEmoji} *${data.shiftLabel}*\n`;
  msg += `================================\n`;
  msg += `*बाजार*            *धंदा*  *सुट्टा* *जेन्ट*  *पाना*\n`;
  msg += `--------------------------------\n`;

  data.rows.forEach((r) => {
    const market = r.sessionLabel.padEnd(14, " ");
    const dhanda = r.dhanda > 0 ? `${r.dhanda}`.padStart(5, " ") : "    -";
    const sutta = r.suttaWin > 0 ? `${r.suttaWin}`.padStart(6, " ") : "     -";
    const jent = r.jentWin > 0 ? `${r.jentWin}`.padStart(5, " ") : "    -";
    let pannaStr = "-";
    if (r.pannaWin > 0) {
      pannaStr = `${r.pannaWin}${r.pannaNote ? ` (${r.pannaNote})` : ""}`;
    }
    const panna = pannaStr !== "-" ? pannaStr.padStart(6, " ") : "     -";
    msg += `${market} ${dhanda} ${sutta} ${jent} ${panna}\n`;
  });

  msg += `--------------------------------\n`;
  msg += `*एकूण धंदा*              : ₹${data.totalDhanda.toLocaleString("en-IN")}\n`;
  const magilSign = data.magilNave >= 0 ? "+" : "-";
  msg += `*मागील नावे (पुराना बाकी)* : ${magilSign}₹${Math.abs(data.magilNave).toLocaleString("en-IN")}\n`;
  msg += `*कमीशन (${data.commissionRate}% कमी)*        : -₹${data.totalCommission.toLocaleString("en-IN")}\n`;
  msg += `*कुल विनिंग दावे*         : -₹${data.totalWinnings.toLocaleString("en-IN")}\n`;
  msg += `--------------------------------\n`;
  msg += `${statusEmoji} *अंतिम बाकी (${statusText})* : *₹${data.statusAmount.toLocaleString("en-IN")}*\n`;
  msg += `================================\n`;
  if (data.shift === "day") {
    msg += `_(यह बैलेंस नाईट शिफ्ट में ऑटोमैटिक कैरी-फॉरवर्ड होगा)_\n`;
  } else if (data.shift === "night") {
    msg += `_(यह बैलेंस अगले दिन सुबह के हिसाब में कैरी-फॉरवर्ड होगा)_\n`;
  }
  return msg;
}

// 58mm ESC/POS byte generator for Traditional Khata-Bahi (32 columns)
export function generateKhataBahiEscPosBytes(data: TraditionalKhataData): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  const add = (str: string) => parts.push(encoder.encode(str));
  const addBytes = (bytes: number[]) => parts.push(new Uint8Array(bytes));

  // 1. Initialize printer (ESC @)
  addBytes([0x1b, 0x40]);

  // 2. Center Align Header
  addBytes([0x1b, 0x61, 0x01]); // center
  addBytes([0x1b, 0x45, 0x01]); // bold on
  addBytes([0x1d, 0x21, 0x11]); // double width & height
  add("PLAYON BOOK\n");
  addBytes([0x1d, 0x21, 0x00]); // normal font
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("TRADITIONAL KHATA-BAHI\n");
  add(`Date: ${data.dateStr}\n`);
  add("================================\n");

  // 3. Left Align Info
  addBytes([0x1b, 0x61, 0x00]); // left
  add(`Agent: ${data.agentName}\n`);
  if (data.phone) {
    add(`Phone: ${data.phone}\n`);
  }
  const shiftText =
    data.shift === "day"
      ? "DAY SHIFT (PINK SLIP)"
      : data.shift === "night"
        ? "NIGHT SHIFT (BLUE SLIP)"
        : "FULL DAY (ALL SHIFTS)";
  add(`Shift: ${shiftText}\n`);
  add("--------------------------------\n");

  // 4. Table Header (32 columns width for 58mm roll)
  // Columns: MARKET(10) DHAN(6) SUT(5) JOD(5) PAN(6) = 32 chars
  add("MARKET     DHAN  SUT  JOD   PAN\n");
  add("--------------------------------\n");

  data.rows.forEach((r) => {
    const market = r.sessionLabelShort.slice(0, 10).padEnd(10, " ");
    const dhan = (r.dhanda > 0 ? `${r.dhanda}` : "-").padStart(6, " ");
    const sut = (r.suttaWin > 0 ? `${r.suttaWin}` : "-").padStart(5, " ");
    const jod = (r.jentWin > 0 ? `${r.jentWin}` : "-").padStart(5, " ");
    const pan = (r.pannaWin > 0 ? `${r.pannaWin}` : "-").padStart(6, " ");
    add(`${market}${dhan}${sut}${jod}${pan}\n`);
  });

  add("--------------------------------\n");

  // 5. Financial Summary (32 cols)
  const padRow = (label: string, val: string) => {
    return `${label.padEnd(17, " ")}${val.padStart(15, " ")}\n`;
  };

  add(padRow("TOTAL DHANDA:", `Rs.${data.totalDhanda.toLocaleString("en-IN")}`));
  const magilSign = data.magilNave >= 0 ? "+" : "-";
  add(padRow("MAGIL NAVE (OLD):", `${magilSign}Rs.${Math.abs(data.magilNave).toLocaleString("en-IN")}`));
  add(padRow(`COMM (${data.commissionRate}%):`, `-Rs.${data.totalCommission.toLocaleString("en-IN")}`));
  add(padRow("TOTAL WINNINGS:", `-Rs.${data.totalWinnings.toLocaleString("en-IN")}`));
  add("--------------------------------\n");

  // 6. Final Status (Bold, Double Height, Center)
  addBytes([0x1b, 0x61, 0x01]); // center
  addBytes([0x1b, 0x45, 0x01]); // bold on
  addBytes([0x1d, 0x21, 0x01]); // double height
  const statusStr = data.status === "nave" ? "ANTIM NAVE (DEBIT)" : "ANTIM JAMA (CREDIT)";
  add(`${statusStr}\n`);
  add(`Rs.${data.statusAmount.toLocaleString("en-IN")}\n`);
  addBytes([0x1d, 0x21, 0x00]); // normal font
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("================================\n");

  // 7. Footer Center
  if (data.shift === "day") {
    add("Carried forward to Night Shift\n");
  } else if (data.shift === "night") {
    add("Carried forward to Next Day\n");
  }
  add("Good Luck! Thank You!\n\n\n\n");

  // Cut
  addBytes([0x1d, 0x56, 0x01]);

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
