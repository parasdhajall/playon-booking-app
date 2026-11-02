// Khata-Bahi High-Resolution Canvas Image Generator
// Generates ultra-crisp authentic Pink (Day) and Blue (Night) Slip Images for WhatsApp sharing

import type { TraditionalKhataData } from "./khataBahi";

export async function generateKhataSlipImageBlob(data: TraditionalKhataData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const isPink = data.shift === "day";
      const isBlue = data.shift === "night";

      // Color palettes
      const colors = isPink
        ? {
            bg: "#fff1f2",
            cardBorder: "#fecdd3",
            headerText: "#881337",
            subText: "#9f1239",
            badgeBg: "#ffe4e6",
            badgeText: "#be123c",
            tableHeaderBg: "#ffe4e6",
            tableHeaderText: "#9f1239",
            tableBorder: "#fecdd3",
            rowText: "#881337",
            dhandaText: "#881337",
            suttaText: "#047857",
            jentText: "#1d4ed8",
            pannaText: "#6d28d9",
            dashedLine: "#fda4af",
            finalBg: data.status === "nave" ? "#ffe4e6" : "#d1fae5",
            finalBorder: data.status === "nave" ? "#f43f5e" : "#10b981",
            finalText: data.status === "nave" ? "#9f1239" : "#065f46",
          }
        : isBlue
          ? {
              bg: "#eff6ff",
              cardBorder: "#bfdbfe",
              headerText: "#1e3a8a",
              subText: "#1e40af",
              badgeBg: "#dbeafe",
              badgeText: "#1d4ed8",
              tableHeaderBg: "#dbeafe",
              tableHeaderText: "#1e40af",
              tableBorder: "#bfdbfe",
              rowText: "#1e3a8a",
              dhandaText: "#1e3a8a",
              suttaText: "#047857",
              jentText: "#1d4ed8",
              pannaText: "#6d28d9",
              dashedLine: "#93c5fd",
              finalBg: data.status === "nave" ? "#fee2e2" : "#d1fae5",
              finalBorder: data.status === "nave" ? "#ef4444" : "#10b981",
              finalText: data.status === "nave" ? "#991b1b" : "#065f46",
            }
          : {
              bg: "#fffbeb",
              cardBorder: "#fde68a",
              headerText: "#78350f",
              subText: "#92400e",
              badgeBg: "#fef3c7",
              badgeText: "#b45309",
              tableHeaderBg: "#fef3c7",
              tableHeaderText: "#92400e",
              tableBorder: "#fde68a",
              rowText: "#78350f",
              dhandaText: "#78350f",
              suttaText: "#047857",
              jentText: "#1d4ed8",
              pannaText: "#6d28d9",
              dashedLine: "#fcd34d",
              finalBg: data.status === "nave" ? "#fee2e2" : "#d1fae5",
              finalBorder: data.status === "nave" ? "#ef4444" : "#10b981",
              finalText: data.status === "nave" ? "#991b1b" : "#065f46",
            };

      // Calculate dynamic dimensions
      const width = 580;
      const rowHeight = 36;
      const rowsCount = Math.max(data.rows.length, 1);
      const tableHeight = 40 + rowsCount * rowHeight;
      const baseHeight = 150 + tableHeight + 230; // header + table + totals + final box + padding
      const height = baseHeight;

      // 2x Retina scaling for ultra crisp fonts
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      ctx.scale(scale, scale);

      // Helper: Rounded Rectangle
      const roundRect = (
        x: number,
        y: number,
        w: number,
        h: number,
        radius: number,
        fill = true,
        stroke = true
      ) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
      };

      // 1. Background Card with Rounded Corners
      ctx.fillStyle = colors.bg;
      ctx.strokeStyle = colors.cardBorder;
      ctx.lineWidth = 2;
      roundRect(8, 8, width - 16, height - 16, 20, true, true);

      // 2. Header
      ctx.textAlign = "center";
      ctx.fillStyle = colors.headerText;
      ctx.font = "bold 26px 'Barlow', 'Segoe UI', -apple-system, sans-serif";
      ctx.fillText("PLAYON BOOK", width / 2, 42);

      // Subtitle: Date, Agent, Phone
      ctx.fillStyle = colors.subText;
      ctx.font = "bold 13px 'Segoe UI', -apple-system, sans-serif";
      const phonePart = data.phone ? ` • मो: ${data.phone}` : "";
      ctx.fillText(`📅 ${data.dateStr}  •  एजेंट: ${data.agentName}${phonePart}`, width / 2, 66);

      // Shift Badge
      ctx.fillStyle = colors.badgeBg;
      ctx.strokeStyle = colors.cardBorder;
      ctx.lineWidth = 1;
      const badgeW = 220;
      const badgeX = (width - badgeW) / 2;
      roundRect(badgeX, 78, badgeW, 26, 13, true, true);

      ctx.fillStyle = colors.badgeText;
      ctx.font = "bold 12px 'Segoe UI', -apple-system, sans-serif";
      ctx.fillText(data.shiftLabel, width / 2, 95);

      // Dashed Line below header
      let curY = 118;
      ctx.strokeStyle = colors.dashedLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(24, curY);
      ctx.lineTo(width - 24, curY);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // 3. Table Header
      curY += 12;
      ctx.fillStyle = colors.tableHeaderBg;
      ctx.strokeStyle = colors.tableBorder;
      ctx.lineWidth = 1;
      roundRect(24, curY, width - 48, 30, 8, true, true);

      ctx.fillStyle = colors.tableHeaderText;
      ctx.font = "bold 12px 'Segoe UI', -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("बाजार", 36, curY + 20);

      ctx.textAlign = "right";
      ctx.fillText("धंदा", 210, curY + 20);
      ctx.fillText("सुट्टा", 295, curY + 20);
      ctx.fillText("जेन्ट", 380, curY + 20);
      ctx.fillText("पाना", 535, curY + 20);

      curY += 30;

      // 4. Table Rows
      if (data.rows.length === 0) {
        curY += 10;
        ctx.textAlign = "center";
        ctx.fillStyle = "#6b7280";
        ctx.font = "italic 13px 'Segoe UI', sans-serif";
        ctx.fillText("या शिफ्टमध्ये कोणताही खेळ झालेला नाही.", width / 2, curY + 20);
        curY += 30;
      } else {
        ctx.font = "13px 'Segoe UI', -apple-system, sans-serif";
        data.rows.forEach((r, idx) => {
          curY += 5;

          // Subtle alternating row tint
          if (idx % 2 === 1) {
            ctx.fillStyle = colors.tableHeaderBg;
            ctx.globalAlpha = 0.4;
            roundRect(24, curY, width - 48, rowHeight - 4, 6, true, false);
            ctx.globalAlpha = 1.0;
          }

          // Market / Session Label (Left)
          ctx.textAlign = "left";
          ctx.fillStyle = colors.rowText;
          ctx.font = "bold 13px 'Segoe UI', sans-serif";
          ctx.fillText(r.sessionLabel, 36, curY + 20);

          // Numbers (Right)
          ctx.font = "600 13px 'Segoe UI', monospace";

          // Dhanda
          ctx.textAlign = "right";
          ctx.fillStyle = colors.dhandaText;
          ctx.fillText(r.dhanda > 0 ? `₹${r.dhanda.toLocaleString("en-IN")}` : "—", 210, curY + 20);

          // Sutta Win
          ctx.fillStyle = colors.suttaText;
          ctx.fillText(r.suttaWin > 0 ? `₹${r.suttaWin.toLocaleString("en-IN")}` : "—", 295, curY + 20);

          // Jent Win
          ctx.fillStyle = colors.jentText;
          ctx.fillText(r.jentWin > 0 ? `₹${r.jentWin.toLocaleString("en-IN")}` : "—", 380, curY + 20);

          // Panna Win
          ctx.fillStyle = colors.pannaText;
          const pannaText =
            r.pannaWin > 0
              ? `₹${r.pannaWin.toLocaleString("en-IN")}${r.pannaNote ? ` (${r.pannaNote})` : ""}`
              : "—";
          ctx.fillText(pannaText, 535, curY + 20);

          curY += rowHeight - 4;
        });
      }

      curY += 10;

      // Dashed Line before Totals
      ctx.strokeStyle = colors.dashedLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(24, curY);
      ctx.lineTo(width - 24, curY);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // 5. Financial Summary Lines
      curY += 18;
      const renderSummaryLine = (label: string, value: string, valColor: string, isBold = false) => {
        ctx.textAlign = "left";
        ctx.fillStyle = colors.subText;
        ctx.font = isBold ? "bold 13px 'Segoe UI', sans-serif" : "600 13px 'Segoe UI', sans-serif";
        ctx.fillText(label, 36, curY);

        ctx.textAlign = "right";
        ctx.fillStyle = valColor;
        ctx.font = isBold ? "bold 14px 'Segoe UI', monospace" : "bold 13px 'Segoe UI', monospace";
        ctx.fillText(value, width - 36, curY);

        curY += 22;
      };

      renderSummaryLine(
        "एकूण धंदा (Total Sale):",
        `₹${data.totalDhanda.toLocaleString("en-IN")}`,
        colors.headerText,
        true
      );

      const magilSign = data.magilNave >= 0 ? "+" : "-";
      renderSummaryLine(
        "मागील नावे (मागील बाकी / Carry):",
        `${magilSign}₹${Math.abs(data.magilNave).toLocaleString("en-IN")}`,
        colors.subText
      );

      renderSummaryLine(
        `कमीशन (${data.commissionRate}% वजा):`,
        `-₹${data.totalCommission.toLocaleString("en-IN")}`,
        "#047857"
      );

      renderSummaryLine(
        "एकूण विनिंग दावे (Total Winnings):",
        `-₹${data.totalWinnings.toLocaleString("en-IN")}`,
        "#be123c"
      );

      // 6. Final Status Box (Big Bold Card)
      curY += 6;
      ctx.fillStyle = colors.finalBg;
      ctx.strokeStyle = colors.finalBorder;
      ctx.lineWidth = 2;
      roundRect(24, curY, width - 48, 54, 14, true, true);

      // Left Status Text
      ctx.textAlign = "left";
      ctx.fillStyle = colors.finalText;
      ctx.font = "bold 10px 'Segoe UI', sans-serif";
      ctx.fillText("अंतिम बाकी हिसाब (FINAL BALANCE)", 40, curY + 20);

      ctx.font = "bold 15px 'Segoe UI', sans-serif";
      const statusTitle =
        data.status === "nave" ? "● नावे (एजंटने देणे बाकी)" : "● जमा (एजंटला देणे / जमा)";
      ctx.fillText(statusTitle, 40, curY + 41);

      // Right Big Amount
      ctx.textAlign = "right";
      ctx.font = "bold 24px 'Barlow', 'Segoe UI', sans-serif";
      ctx.fillText(`₹${data.statusAmount.toLocaleString("en-IN")}`, width - 40, curY + 36);

      // 7. Footer Note
      curY += 72;
      ctx.textAlign = "center";
      ctx.fillStyle = colors.subText;
      ctx.font = "italic 11px 'Segoe UI', sans-serif";
      const footerMsg =
        data.shift === "day"
          ? "ℹ️ हा अंतिम नावे/जमा बॅलन्स नाईट शिफ्टच्या 'मागील नावे' मध्ये ऑटो-कॅरी होईल."
          : data.shift === "night"
            ? "ℹ️ हा अंतिम नावे/जमा बॅलन्स उद्या सकाळच्या हिशोबात ऑटो-कॅरी होईल."
            : "ℹ️ संपूर्ण दिवसाचा एकत्रित डिजिटल हिशोब.";
      ctx.fillText(footerMsg, width / 2, curY);

      // Convert canvas to Blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas toBlob failed"));
        }
      }, "image/png");
    } catch (err) {
      reject(err);
    }
  });
}

