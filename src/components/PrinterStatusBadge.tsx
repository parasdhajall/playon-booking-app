import { Printer } from "lucide-react";
import { toast } from "sonner";
import { usePrinter, isAndroidNativeApp } from "@/lib/thermalPrinter";

interface PrinterStatusBadgeProps {
  className?: string;
  showTextOnMobile?: boolean;
}

export function PrinterStatusBadge({
  className = "",
  showTextOnMobile = false,
}: PrinterStatusBadgeProps) {
  const { status, deviceName, isConnected, isConnecting, connect, disconnect } = usePrinter();
  const isAndroid = isAndroidNativeApp();

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If already paired / connected, clicking lets user change or disconnect
    if (isConnected || (isAndroid && deviceName)) {
      const activeName = deviceName || "Printer";
      if (
        confirm(
          `Printer "${activeName}" is currently selected.\n\nDo you want to disconnect or change printer?`
        )
      ) {
        disconnect();
        toast.info("Printer disconnected. Tap again to select a printer.");
      }
      return;
    }

    toast.info("Searching paired Bluetooth printers...");
    const res = await connect();
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  // Status visual state
  const isPairedOnAndroid = isAndroid && !!deviceName;
  const showActive = isConnected;

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`group relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer border ${
        showActive
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 shadow-xs"
          : isConnecting
            ? "border-amber-500/50 bg-amber-500/10 text-amber-500 animate-pulse"
            : isPairedOnAndroid
              ? "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
              : "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
      } ${className}`}
      title={
        showActive
          ? `Printer Connected: ${deviceName}. Tap to disconnect.`
          : isPairedOnAndroid
            ? `Paired Printer: ${deviceName}. Make sure printer is ON before printing.`
            : "Printer Disconnected. Tap to pair Bluetooth printer."
      }
    >
      {/* Status Dot */}
      <span className="relative flex h-2 w-2">
        {showActive && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            showActive
              ? "bg-emerald-500"
              : isConnecting
                ? "bg-amber-500"
                : isPairedOnAndroid
                  ? "bg-sky-400"
                  : "bg-red-500"
          }`}
        ></span>
      </span>

      <Printer className="h-3.5 w-3.5" />

      {/* Label */}
      <span className={showTextOnMobile ? "inline" : "hidden sm:inline"}>
        {showActive
          ? `Printer: ${deviceName || "Connected"}`
          : isConnecting
            ? "Connecting…"
            : isPairedOnAndroid
              ? `Printer: ${deviceName}`
              : "Connect Printer"}
      </span>
    </button>
  );
}
