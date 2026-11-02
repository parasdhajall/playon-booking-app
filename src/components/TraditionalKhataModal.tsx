import { useState, useMemo } from "react";
import {
  X,
  Share2,
  Printer,
  Copy,
  Check,
  Edit2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  Sun,
  Moon,
  Layers,
  Phone,
  Calendar,
  ImageIcon,
  Download,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  type ShiftType,
  type TraditionalKhataData,
  buildTraditionalKhataData,
  generateKhataBahiWhatsAppMessage,
  generateKhataBahiEscPosBytes,
  printKhataBahiAsPdf,
  saveMagilNave,
} from "@/lib/khataBahi";
import { generateKhataSlipImageBlob } from "@/lib/khataImageGenerator";
import { printerManager, usePrinter, isAndroidNativeApp } from "@/lib/thermalPrinter";
import { PrinterStatusBadge } from "./PrinterStatusBadge";

interface TraditionalKhataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  } | null;
  dateStrDisplay: string;
  rawDateStr: string;
  allMarkets: Array<{ id: string; name: string; close_time?: string; sort_order?: number }>;
  initialShift?: ShiftType;
}

export function TraditionalKhataModal({
  open,
  onOpenChange,
  agent,
  dateStrDisplay,
  rawDateStr,
  allMarkets,
  initialShift = "day",
}: TraditionalKhataModalProps) {
  const [shift, setShift] = useState<ShiftType>(initialShift);
  const [isEditingMagil, setIsEditingMagil] = useState(false);
  const [tempMagilInput, setTempMagilInput] = useState<string>("");
  const [manualMagilOverrides, setManualMagilOverrides] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const { isConnected: isPrinterConnected, deviceName } = usePrinter();

  // Shift-specific override key
  const overrideKey = `${agent?.id}_${rawDateStr}_${shift}`;
  const activeManualMagil = manualMagilOverrides[overrideKey] ?? null;

  // Build the traditional khata data
  const khataData: TraditionalKhataData | null = useMemo(() => {
    if (!agent) return null;
    return buildTraditionalKhataData(
      agent,
      allMarkets,
      shift,
      dateStrDisplay,
      rawDateStr,
      activeManualMagil
    );
  }, [agent, allMarkets, shift, dateStrDisplay, rawDateStr, activeManualMagil]);

  if (!agent || !khataData) return null;

  // Handle Save Manual Magil Nave
  const handleSaveMagilNave = () => {
    const val = Number(tempMagilInput);
    if (isNaN(val)) {
      toast.error("कृपया वैध रक्कम टाका (Enter valid amount)");
      return;
    }
    setManualMagilOverrides((prev) => ({ ...prev, [overrideKey]: val }));
    saveMagilNave(agent.id, rawDateStr, shift, val);
    setIsEditingMagil(false);
    toast.success(`मागील नावे ₹${val} अपडेट केले!`);
  };

  // 1-Click WhatsApp Photo Share (Exact visual slip image)
  const handleShareImage = async () => {
    try {
      setIsGeneratingImage(true);
      toast.info("फोटो पर्ची तयार होत आहे...");
      const blob = await generateKhataSlipImageBlob(khataData);
      const fileName = `Khata_${agent.name.replace(/\s+/g, "_")}_${khataData.shift}_${rawDateStr}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      // 1. Mobile Android / iOS: Native WhatsApp File Share
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `PLAYON BOOK - ${agent.name} (${khataData.shiftLabel})`,
          text: `📖 PLAYON BOOK: ${agent.name} • ${khataData.shiftLabel}\nअंतिम बाकी: ₹${khataData.statusAmount.toLocaleString("en-IN")} (${khataData.status === "nave" ? "नावे" : "जमा"})`,
        });
        toast.success("फोटो WhatsApp वर पाठवला!");
        setIsGeneratingImage(false);
        return;
      }

      // 2. Desktop / PC Fallback: Copy Image to Clipboard & Open WhatsApp
      if (navigator.clipboard && (window as any).ClipboardItem) {
        try {
          await navigator.clipboard.write([
            new (window as any).ClipboardItem({ "image/png": blob }),
          ]);
          toast.success("📋 फोटो कॉपी झाला! WhatsApp चॅटमध्ये Ctrl + V दाबा!");

          const cleanPhone = (agent.phone || "").replace(/\D/g, "");
          const targetUrl =
            cleanPhone.length >= 10 ? `https://wa.me/91${cleanPhone.slice(-10)}` : `https://wa.me/`;
          window.open(targetUrl, "_blank");
          setIsGeneratingImage(false);
          return;
        } catch (clipErr) {
          console.warn("Clipboard write failed", clipErr);
        }
      }

      // 3. Fallback: Download file directly
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("फोटो डाउनलोड झाला!");
      setIsGeneratingImage(false);
    } catch (err: any) {
      setIsGeneratingImage(false);
      toast.error(`फोटो शेअर करण्यात त्रुटी: ${err?.message || "त्रुटी"}`);
    }
  };

  // Direct Download Image Button
  const handleDownloadImage = async () => {
    try {
      setIsGeneratingImage(true);
      const blob = await generateKhataSlipImageBlob(khataData);
      const fileName = `Khata_${agent.name.replace(/\s+/g, "_")}_${khataData.shift}_${rawDateStr}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("फोटो डाऊनलोड झाला!");
      setIsGeneratingImage(false);
    } catch (err: any) {
      setIsGeneratingImage(false);
      toast.error("डाऊनलोड करण्यात त्रुटी आली.");
    }
  };

  // 1-Click WhatsApp Text Send
  const handleWhatsAppShare = () => {
    const msg = generateKhataBahiWhatsAppMessage(khataData);
    const cleanPhone = (agent.phone || "").replace(/\D/g, "");
    const targetUrl =
      cleanPhone.length >= 10
        ? `https://wa.me/91${cleanPhone.slice(-10)}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(targetUrl, "_blank");
    toast.success("WhatsApp उघडले!");
  };

  // 1-Click Copy
  const handleCopyText = async () => {
    const msg = generateKhataBahiWhatsAppMessage(khataData);
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("पर्ची मजकूर कॉपी झाला (Copied to clipboard)!");
    } catch {
      toast.error("कॉपी करण्यात त्रुटी आली.");
    }
  };

  // Direct Normal Full-Size Print & "Save as PDF" (Standard print without thermal printer)
  const handleNormalPrintOrPdf = () => {
    toast.info("प्रिंट डायलॉग उघडत आहे (PDF सेव्ह करा किंवा प्रिंट करा)...");
    printKhataBahiAsPdf(khataData);
  };

  // 1-Click 58mm Thermal Print
  const handleThermalPrint = async () => {
    setIsPrinting(true);
    toast.info("थर्मल प्रिंटरवर पाठवत आहे...");

    const bytes = generateKhataBahiEscPosBytes(khataData);

    // 1. Android Native App Bridge
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (!bridge.isBluetoothEnabled()) {
        setIsPrinting(false);
        toast.error("मोबाईलचे Bluetooth OFF आहे. कृपया Bluetooth सुरू करा.");
        return;
      }
      if (!bridge.hasPermissions()) {
        bridge.requestPermissions();
        setIsPrinting(false);
        toast.error("Bluetooth परवानगी द्या आणि पुन्हा प्रयत्न करा.");
        return;
      }

      try {
        const raw = bridge.getPairedDevices();
        const devices: { name: string; address: string }[] = JSON.parse(raw || "[]");
        const target =
          devices.find((d) => /print|pos|mtp|inner|rp|mpt|veer|seznik|bluetooth/i.test(d.name)) ||
          devices[0];

        if (!target) {
          setIsPrinting(false);
          toast.error("कोणताही paired Bluetooth प्रिंटर सापडला नाही.");
          return;
        }

        // Convert bytes to base64
        let binary = "";
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i] ?? 0);
        }
        const b64 = window.btoa(binary);

        const resStr = bridge.sendBytes(target.address, b64);
        const res = JSON.parse(resStr || "{}");
        setIsPrinting(false);
        if (res.success) {
          toast.success("थर्मल पावती प्रिंट झाली!");
        } else {
          toast.error(`प्रिंट अयशस्वी: ${res.message || "त्रुटी"}`);
        }
        return;
      } catch (err: any) {
        setIsPrinting(false);
        toast.error(`Android print error: ${err.message}`);
        return;
      }
    }

    // 2. Standard Web Bluetooth
    if (printerManager.isConnected()) {
      const res = await printerManager.sendBytes(bytes);
      setIsPrinting(false);
      if (res.success) {
        toast.success("थर्मल प्रिंटरवर पावती प्रिंट झाली!");
      } else {
        toast.error(`प्रिंट अयशस्वी: ${res.message}`);
      }
    } else {
      const conn = await printerManager.connect();
      if (conn.success) {
        const res = await printerManager.sendBytes(bytes);
        setIsPrinting(false);
        if (res.success) {
          toast.success("थर्मल प्रिंटरवर पावती प्रिंट झाली!");
        } else {
          toast.error(`प्रिंट अयशस्वी: ${res.message}`);
        }
      } else {
        setIsPrinting(false);
        toast.error(`प्रिंटर कनेक्ट होऊ शकला नाही: ${conn.message}`);
      }
    }
  };

  // Browser / System Print
  const handleSystemPrint = () => {
    window.print();
  };

  // Dynamic Theme Styling
  const isPink = shift === "day";
  const isBlue = shift === "night";

  const themeClasses = isPink
    ? {
        container: "bg-[#fff1f2] text-[#881337] border-[#fecdd3] shadow-rose-100",
        headerBadge: "bg-[#ffe4e6] text-[#be123c] border-[#f43f5e]/30",
        tableHeader: "bg-[#ffe4e6]/90 text-[#9f1239] border-[#fecdd3]",
        tableRow: "hover:bg-[#ffe4e6]/50 border-[#fecdd3]/60",
        accentText: "text-[#be123c]",
        totalBox: "bg-[#ffe4e6]/70 border-[#fecdd3]",
        tag: "🌸 डे बाजार (DAY SHIFT)",
      }
    : isBlue
      ? {
          container: "bg-[#eff6ff] text-[#1e3a8a] border-[#bfdbfe] shadow-blue-100",
          headerBadge: "bg-[#dbeafe] text-[#1d4ed8] border-[#3b82f6]/30",
          tableHeader: "bg-[#dbeafe]/90 text-[#1e40af] border-[#bfdbfe]",
          tableRow: "hover:bg-[#dbeafe]/50 border-[#bfdbfe]/60",
          accentText: "text-[#1d4ed8]",
          totalBox: "bg-[#dbeafe]/70 border-[#bfdbfe]",
          tag: "🔷 नाईट बाजार (NIGHT SHIFT)",
        }
      : {
          container: "bg-[#fffbeb] text-[#78350f] border-[#fde68a] shadow-amber-100",
          headerBadge: "bg-[#fef3c7] text-[#b45309] border-[#f59e0b]/30",
          tableHeader: "bg-[#fef3c7]/90 text-[#92400e] border-[#fde68a]",
          tableRow: "hover:bg-[#fef3c7]/50 border-[#fde68a]/60",
          accentText: "text-[#b45309]",
          totalBox: "bg-[#fef3c7]/70 border-[#fde68a]",
          tag: "🌟 संपूर्ण दिवस (FULL DAY)",
        };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-3 sm:p-5 max-h-[94vh] overflow-y-auto bg-card border-border">
        <DialogHeader className="pb-2 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>📖 पारंपरिक खाता-बही</span>
                <span className="text-xs font-normal text-muted-foreground">
                  (Digital Khata)
                </span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                एजंट: <strong className="text-foreground">{agent.name}</strong>{" "}
                {agent.phone && `(${agent.phone})`} • {dateStrDisplay}
              </p>
            </div>
            <PrinterStatusBadge showTextOnMobile={false} />
          </div>
        </DialogHeader>

        {/* 1. Shift Selector Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-secondary/60 rounded-xl border">
          <button
            type="button"
            onClick={() => {
              setShift("day");
              setIsEditingMagil(false);
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              shift === "day"
                ? "bg-[#f43f5e] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            <span>🌸 डे बाजार (Pink Slip)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShift("night");
              setIsEditingMagil(false);
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              shift === "night"
                ? "bg-[#2563eb] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            <span>🔷 नाईट बाजार (Blue Slip)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShift("all");
              setIsEditingMagil(false);
            }}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              shift === "all"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="संपूर्ण दिवस (Full Day Combined)"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">दोन्ही</span>
          </button>
        </div>

        {/* 2. Authentic Paper Slip Card */}
        <div
          id="traditional-khata-print-area"
          className={`rounded-2xl border-2 p-4 transition-all shadow-md font-sans ${themeClasses.container}`}
        >
          {/* Slip Header */}
          <div className="text-center pb-3 border-b-2 border-dashed border-current/30 space-y-1">
            <h3 className="font-display text-2xl tracking-wider font-bold">
              PLAYON BOOK
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {dateStrDisplay}
              </span>
              <span>•</span>
              <span>एजेंट: {agent.name}</span>
              {agent.phone && (
                <>
                  <span>•</span>
                  <span>मो: {agent.phone}</span>
                </>
              )}
            </div>
            <div className="pt-1">
              <span
                className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${themeClasses.headerBadge}`}
              >
                {themeClasses.tag}
              </span>
            </div>
          </div>

          {/* Table Breakdown: बाजार, धंदा, सुट्टा, जेन्ट, पाना */}
          <div className="my-3 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className={`border-b-2 border-current/40 ${themeClasses.tableHeader}`}>
                  <th className="p-2 text-left font-bold">बाजार</th>
                  <th className="p-2 text-right font-bold">धंदा</th>
                  <th className="p-2 text-right font-bold">सुट्टा</th>
                  <th className="p-2 text-right font-bold">जेन्ट</th>
                  <th className="p-2 text-right font-bold">पाना</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-current/15">
                {khataData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      या शिफ्टमध्ये कोणताही खेळ झालेला नाही (No plays in this shift).
                    </td>
                  </tr>
                ) : (
                  khataData.rows.map((r, i) => (
                    <tr key={`${r.marketId}_${r.session}_${i}`} className={themeClasses.tableRow}>
                      <td className="p-2 font-bold whitespace-nowrap">
                        {r.sessionLabel}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {r.dhanda > 0 ? `₹${r.dhanda.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {r.suttaWin > 0 ? `₹${r.suttaWin.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-blue-700 dark:text-blue-400">
                        {r.jentWin > 0 ? `₹${r.jentWin.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-purple-700 dark:text-purple-400 whitespace-nowrap">
                        {r.pannaWin > 0 ? (
                          <span>
                            ₹{r.pannaWin.toLocaleString("en-IN")}
                            {r.pannaNote && (
                              <span className="text-[10px] ml-1 opacity-80">
                                ({r.pannaNote})
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Calculations Section */}
          <div className="border-t-2 border-dashed border-current/30 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="font-semibold">एकूण धंदा (Total Sale):</span>
              <span className="font-mono font-bold text-sm">
                ₹{khataData.totalDhanda.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Editable मागील नावे (Previous Balance) */}
            <div className="flex justify-between items-center py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">
                  मागील नावे (मागील बाकी / Carry):
                </span>
                {!isEditingMagil && (
                  <button
                    type="button"
                    onClick={() => {
                      setTempMagilInput(khataData.magilNave.toString());
                      setIsEditingMagil(true);
                    }}
                    className="p-1 rounded hover:bg-current/10 text-current transition-colors"
                    title="मागील नावे बदला (Edit Previous Balance)"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              {isEditingMagil ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={tempMagilInput}
                    onChange={(e) => setTempMagilInput(e.target.value)}
                    className="h-7 w-24 text-xs font-mono font-bold"
                    placeholder="रक्कम"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleSaveMagilNave}
                  >
                    OK
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-xs"
                    onClick={() => setIsEditingMagil(false)}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <span className="font-mono font-bold text-sm">
                  {khataData.magilNave >= 0 ? "+" : "-"}₹
                  {Math.abs(khataData.magilNave).toLocaleString("en-IN")}
                </span>
              )}
            </div>

            <div className="flex justify-between items-center py-0.5 text-current/80">
              <span>कमीशन ({khataData.commissionRate}% वजा):</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                -₹{khataData.totalCommission.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="flex justify-between items-center py-0.5 text-current/80">
              <span>एकूण विनिंग दावे (Total Winnings):</span>
              <span className="font-mono font-bold text-rose-700 dark:text-rose-400">
                -₹{khataData.totalWinnings.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Bottom Final Status Box */}
            <div
              className={`mt-3 p-3 rounded-xl border-2 flex items-center justify-between ${
                khataData.status === "nave"
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-800 dark:text-rose-200"
                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200"
              }`}
            >
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider block">
                  अंतिम बाकी हिसाब (Final Balance)
                </span>
                <span className="text-base font-extrabold flex items-center gap-1.5">
                  {khataData.status === "nave" ? (
                    <>
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-600 animate-pulse" />
                      नावे (एजंटने देणे बाकी)
                    </>
                  ) : (
                    <>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
                      जमा (एजंटला देणे / जमा)
                    </>
                  )}
                </span>
              </div>

              <div className="text-right">
                <span className="font-display text-2xl font-black">
                  ₹{khataData.statusAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Carry Forward Note */}
            <p className="text-[11px] text-center text-current/70 pt-1 italic">
              {shift === "day"
                ? "ℹ️ हा अंतिम नावे/जमा बॅलन्स नाईट शिफ्टच्या 'मागील नावे' मध्ये ऑटो-कॅरी होईल."
                : shift === "night"
                  ? "ℹ️ हा अंतिम नावे/जमा बॅलन्स उद्या सकाळच्या हिशोबात ऑटो-कॅरी होईल."
                  : "ℹ️ संपूर्ण दिवसाचा एकत्रित हिशोब."}
            </p>
          </div>
        </div>

        {/* 3. Bottom Action Buttons Bar */}
        <div className="space-y-2 pt-2 border-t">
          {/* Main Action: WhatsApp Photo Slip (Exact visual slip image) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={handleShareImage}
              disabled={isGeneratingImage}
              className="h-11 text-xs sm:text-sm font-bold bg-[#25D366] hover:bg-[#20ba59] text-white flex items-center justify-center gap-2 shadow-md rounded-xl cursor-pointer"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>फोटो तयार होत आहे...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  <span>WhatsApp वर फोटो पाठवा (Share Image)</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadImage}
              disabled={isGeneratingImage}
              className="h-11 text-xs font-bold rounded-xl flex items-center justify-center gap-2 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>फोटो डाऊनलोड करा (Download Slip)</span>
            </Button>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-0.5">
            {/* WhatsApp Text Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleWhatsAppShare}
              className="h-9 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              title="मजकूर स्वरूपात पाठवा (Send as Monospace Text)"
            >
              <MessageSquare className="h-3.5 w-3.5 text-[#25D366]" />
              <span className="truncate">मजकूर पाठवा</span>
            </Button>

            {/* Normal Full-Size Print & Save as PDF Button */}
            <Button
              type="button"
              onClick={handleNormalPrintOrPdf}
              className="h-9 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-1.5 shadow-xs rounded-xl cursor-pointer"
              title="A4 साइज नॉर्मल प्रिंट किंवा PDF सेव्ह करा (Normal Print or Save as PDF)"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="truncate">प्रिंट / Save PDF</span>
            </Button>

            {/* Copy Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyText}
              className="h-9 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="truncate">कॉपी झाले!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="truncate">मजकूर कॉपी</span>
                </>
              )}
            </Button>

            {/* Close Button */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs font-semibold rounded-xl col-span-3 sm:col-span-1 cursor-pointer"
            >
              बंद करा
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

