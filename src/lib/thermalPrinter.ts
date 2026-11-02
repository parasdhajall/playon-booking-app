// Thermal Printer Utility for 58mm Bluetooth Printers (Native Android Bridge + ESC/POS + Web Bluetooth)
import { useState, useEffect } from "react";

export type ReceiptData = {
  slipId: string;
  marketName: string;
  playerName: string;
  dateStr: string;
  timeStr: string;
  items: {
    gameLabel: string;
    session: "open" | "close";
    number: string;
    points: number;
  }[];
  totalPoints: number;
};

export type PrinterStatus = "disconnected" | "connecting" | "connected";

// Standard 58mm ESC/POS byte generator
export function generateEscPosBytes(data: ReceiptData): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  const add = (str: string) => parts.push(encoder.encode(str));
  const addBytes = (bytes: number[]) => parts.push(new Uint8Array(bytes));

  // 1. Initialize printer (ESC @)
  addBytes([0x1b, 0x40]);

  // 2. Center Align Header
  addBytes([0x1b, 0x61, 0x01]); // ESC a 1 (center)
  addBytes([0x1b, 0x45, 0x01]); // ESC E 1 (bold on)
  addBytes([0x1d, 0x21, 0x11]); // GS ! 11 (double width & height)
  add("PLAY ON\n");
  addBytes([0x1d, 0x21, 0x00]); // GS ! 00 (normal font)
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("================================\n");

  // Market & Info
  addBytes([0x1b, 0x45, 0x01]); // bold on
  add(`${data.marketName.toUpperCase()}\n`);
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add(`Slip: ${data.slipId}\n`);
  add(`Date: ${data.dateStr}  ${data.timeStr}\n`);
  add(`Player: ${data.playerName}\n`);
  add("--------------------------------\n");

  // Left Align Table Header
  addBytes([0x1b, 0x61, 0x00]); // ESC a 0 (left)
  add("TYPE      SESS   NUM     AMT(Rs)\n");
  add("--------------------------------\n");

  // Items (formatted for 32 columns 58mm width)
  data.items.forEach((item) => {
    const type = item.gameLabel.slice(0, 8).padEnd(9, " ");
    const sess = item.session.toUpperCase().slice(0, 4).padEnd(6, " ");
    const num = item.number.slice(0, 6).padEnd(7, " ");
    const amt = `Rs.${item.points}`.padStart(8, " ");
    add(`${type}${sess}${num}${amt}\n`);
  });

  add("--------------------------------\n");

  // Total (Bold)
  addBytes([0x1b, 0x45, 0x01]); // bold on
  add(`TOTAL PLAYS:  ${data.items.length}\n`);
  add(`TOTAL AMOUNT: Rs.${data.totalPoints}\n`);
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("================================\n");

  // Footer Center
  addBytes([0x1b, 0x61, 0x01]); // center
  add("Good Luck! Thank You!\n");
  add("Keep this slip safe\n\n\n\n"); // 4 lines so paper comfortably clears the tear blade

  // Standard partial cut (without feeding extra blank paper)
  addBytes([0x1d, 0x56, 0x01]);

  // Combine into single Uint8Array
  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export type AgentHisabPrintData = {
  agentName: string;
  phone?: string;
  marketName: string;
  dateStr: string;
  playCount: number;
  totalSale: number;
  commissionRate: number;
  totalCommission: number;
  totalWinning: number;
  totalAmount: number;
};

// 58mm ESC/POS byte generator for Agent Hisab Parchi
export function generateAgentHisabEscPosBytes(data: AgentHisabPrintData): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  const add = (str: string) => parts.push(encoder.encode(str));
  const addBytes = (bytes: number[]) => parts.push(new Uint8Array(bytes));

  // 1. Initialize printer (ESC @)
  addBytes([0x1b, 0x40]);

  // 2. Center Align Header
  addBytes([0x1b, 0x61, 0x01]); // ESC a 1 (center)
  addBytes([0x1b, 0x45, 0x01]); // ESC E 1 (bold on)
  addBytes([0x1d, 0x21, 0x11]); // GS ! 11 (double width & height)
  add("PLAY ON\n");
  addBytes([0x1d, 0x21, 0x00]); // GS ! 00 (normal font)
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("AGENT HISAB PARCHI\n");
  add(`Date: ${data.dateStr}\n`);
  add("================================\n");

  // 3. Left Align Info
  addBytes([0x1b, 0x61, 0x00]); // left
  add(`Agent:  ${data.agentName}\n`);
  if (data.phone) {
    add(`Mobile: ${data.phone}\n`);
  }
  addBytes([0x1b, 0x45, 0x01]); // bold on
  add(`Bazar:  ${data.marketName.toUpperCase()}\n`);
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add(`Plays:  ${data.playCount} Plays\n`);
  add("--------------------------------\n");

  // 4. Breakdown Table (32 cols standard 58mm)
  const padRow = (label: string, val: string) => {
    return `${label.padEnd(16, " ")}${val.padStart(16, " ")}\n`;
  };

  add(padRow("Total Sale:", `Rs.${data.totalSale.toLocaleString("en-IN")}`));
  add(padRow(`Comm (${data.commissionRate}%):`, `Rs.${data.totalCommission.toLocaleString("en-IN")}`));
  add(padRow("Winning Amount:", `Rs.${data.totalWinning.toLocaleString("en-IN")}`));
  add("--------------------------------\n");

  // 5. Total Amount (Double Height, Bold, Center)
  addBytes([0x1b, 0x61, 0x01]); // center
  addBytes([0x1b, 0x45, 0x01]); // bold on
  addBytes([0x1d, 0x21, 0x01]); // double height
  add(`TOTAL: Rs.${data.totalAmount.toLocaleString("en-IN")}\n`);
  addBytes([0x1d, 0x21, 0x00]); // normal
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("================================\n");

  // 6. Footer Center
  add("Thank You for Playing with PlayOn\n\n\n\n");

  // Partial paper cut
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

export function isAndroidNativeApp(): boolean {
  return typeof window !== "undefined" && typeof (window as any).AndroidBridge !== "undefined";
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

// Common Thermal Printer Bluetooth GATT Service UUIDs
const COMMON_PRINTER_SERVICES = [
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC transparent UART (most common)
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Everycom / generic POS
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS
  "0000ff00-0000-1000-8000-00805f9b34fb", // FF00 generic thermal
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 / CC2541 UART (very common in 58mm)
  "0000fff0-0000-1000-8000-00805f9b34fb", // FFF0 printer UART
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "de5bf728-d711-4e47-af26-65e3012a5dc7", // Zijiang / Mstar
];

// Persistent Bluetooth Printer Manager Singleton
class BluetoothPrinterManager {
  private device: any = null;
  private server: any = null;
  private writeChar: any = null;
  public status: PrinterStatus = "disconnected";
  public deviceName: string | null = null;
  public deviceAddress: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.deviceName = localStorage.getItem("last_printer_name") || null;
      this.deviceAddress = localStorage.getItem("last_printer_address") || null;
      if (isAndroidNativeApp() && this.deviceName) {
        this.status = "connected";
        const bridge = (window as any).AndroidBridge;
        if (bridge && bridge.connect && this.deviceAddress) {
          try {
            bridge.connect(this.deviceAddress);
          } catch (ignored) {}
        }
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public isConnected(): boolean {
    if (isAndroidNativeApp()) {
      return this.status === "connected" && !!this.deviceName;
    }
    return this.status === "connected" && !!this.writeChar;
  }

  // Connect to Bluetooth Printer
  public async connect(): Promise<{ success: boolean; message: string }> {
    // 1. Native Android App Bridge
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (!bridge.isBluetoothEnabled()) {
        return {
          success: false,
          message: "Mobile Bluetooth OFF hai. Kripya Bluetooth ON karein.",
        };
      }
      if (!bridge.hasPermissions()) {
        bridge.requestPermissions();
        return {
          success: false,
          message: "Bluetooth permission allow karein aur dubara connect karein.",
        };
      }

      try {
        const raw = bridge.getPairedDevices();
        const devices: { name: string; address: string }[] = JSON.parse(raw || "[]");
        if (!devices || devices.length === 0) {
          if (bridge.openBluetoothSettings) {
            bridge.openBluetoothSettings();
          }
          return {
            success: false,
            message: "Koi paired Bluetooth printer nahi mila. Phone settings me pehle printer pair karein.",
          };
        }

        const target = devices.find((d) =>
          /print|pos|mtp|inner|rp|mpt|veer|seznik|bluetooth/i.test(d.name)
        ) || devices[0];

        if (!target) {
          return {
            success: false,
            message: "Koi paired Bluetooth printer nahi mila. Phone settings me pehle printer pair karein.",
          };
        }

        this.deviceName = target.name;
        this.deviceAddress = target.address;
        this.status = "connected";

        if (typeof window !== "undefined") {
          localStorage.setItem("last_printer_name", target.name);
          localStorage.setItem("last_printer_address", target.address);
        }

        // Pre-connect persistent socket in advance so printing is instant
        if (bridge.connect) {
          try {
            bridge.connect(target.address);
          } catch (ignored) {}
        }

        this.notify();
        return {
          success: true,
          message: `Connected to ${target.name}!`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: err.message || "Failed to load paired devices.",
        };
      }
    }

    // 2. Web Bluetooth API (for Chrome browser)
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return {
        success: false,
        message: "Web Bluetooth is not supported in this browser. Please use Chrome on Android.",
      };
    }

    try {
      this.status = "connecting";
      this.notify();

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: COMMON_PRINTER_SERVICES,
      });

      if (!device || !device.gatt) {
        throw new Error("No device selected or Bluetooth GATT not available.");
      }

      device.addEventListener("gattserverdisconnected", () => {
        this.status = "disconnected";
        this.writeChar = null;
        this.server = null;
        this.notify();
      });

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();

      // Known printer characteristics to prioritize
      const KNOWN_WRITE_CHARS = [
        "49535343-8841-43f4-a8d4-ecbe34729bb3", // ISSC transparent write
        "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", // POS write
        "0000ff02-0000-1000-8000-00805f9b34fb", // FF02 write
        "0000ffe1-0000-1000-8000-00805f9b34fb", // HM-10 UART write
        "0000fff1-0000-1000-8000-00805f9b34fb", // FFF1 write
        "0000fff2-0000-1000-8000-00805f9b34fb", // FFF2 write
        "00002af1-0000-1000-8000-00805f9b34fb", // ESC/POS write
      ];

      let foundWriteChar: any = null;

      for (const service of services) {
        const sUuid = service.uuid.toLowerCase();

        // STRICTLY IGNORE standard Bluetooth system services to avoid binding to Device Name (0x2A00)
        if (
          sUuid.includes("1800-") ||
          sUuid.includes("1801-") ||
          sUuid.includes("180a-") ||
          sUuid.includes("180f-")
        ) {
          continue;
        }

        try {
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            const cUuid = c.uuid.toLowerCase();

            // Ignore standard read-only/metadata characteristics
            if (
              cUuid.includes("2a00-") ||
              cUuid.includes("2a01-") ||
              cUuid.includes("2a02-") ||
              cUuid.includes("2a03-") ||
              cUuid.includes("2a04-") ||
              cUuid.includes("2a05-") ||
              cUuid.includes("2a19-") ||
              cUuid.includes("2a29-")
            ) {
              continue;
            }

            if (c.properties.writeWithoutResponse || c.properties.write) {
              // If it's a known dedicated printer write characteristic, take it immediately!
              if (KNOWN_WRITE_CHARS.some((k) => cUuid.includes(k.slice(0, 8)))) {
                foundWriteChar = c;
                break;
              }
              // Otherwise keep as candidate
              if (!foundWriteChar) {
                foundWriteChar = c;
              }
            }
          }
        } catch {
          // ignore restricted services
        }
        if (
          foundWriteChar &&
          KNOWN_WRITE_CHARS.some((k) => foundWriteChar.uuid.toLowerCase().includes(k.slice(0, 8)))
        ) {
          break;
        }
      }

      if (!foundWriteChar) {
        throw new Error("Could not find print channel on this Bluetooth printer.");
      }

      this.device = device;
      this.server = server;
      this.writeChar = foundWriteChar;
      this.status = "connected";
      this.deviceName = device.name || "Bluetooth Printer";

      if (typeof window !== "undefined" && this.deviceName) {
        localStorage.setItem("last_printer_name", this.deviceName);
      }

      this.notify();
      return { success: true, message: `Connected to ${this.deviceName}!` };
    } catch (err: any) {
      this.status = "disconnected";
      this.writeChar = null;
      this.notify();
      return {
        success: false,
        message: err.message || "Failed to connect to printer",
      };
    }
  }

  // Disconnect
  public disconnect() {
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (bridge && bridge.disconnect) {
        try {
          bridge.disconnect();
        } catch (ignored) {}
      }
    }
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.status = "disconnected";
    this.writeChar = null;
    this.server = null;
    this.deviceName = null;
    this.deviceAddress = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("last_printer_name");
      localStorage.removeItem("last_printer_address");
    }
    this.notify();
  }

  // Send raw ESC/POS bytes to connected printer (Web Bluetooth)
  public async sendBytes(bytes: Uint8Array): Promise<{ success: boolean; message: string }> {
    if (!this.isConnected()) {
      return { success: false, message: "Printer is not connected." };
    }

    try {
      // Android Chrome BLE requires 20-byte MTU chunks with a small delay between chunks
      // Without this, Android BLE drops chunks or fails silently
      const chunkSize = 20;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (this.writeChar.properties.writeWithoutResponse && this.writeChar.writeValueWithoutResponse) {
          await this.writeChar.writeValueWithoutResponse(chunk);
        } else if (this.writeChar.writeValueWithResponse) {
          await this.writeChar.writeValueWithResponse(chunk);
        } else {
          await this.writeChar.writeValue(chunk);
        }
        // Essential 20ms pause for Android BLE buffer to flush to printer UART
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { success: true, message: "Receipt printed successfully!" };
    } catch (err: any) {
      this.status = "disconnected";
      this.writeChar = null;
      this.notify();
      return {
        success: false,
        message: err.message || "Print write failed.",
      };
    }
  }

  // Print Receipt automatically
  public async print(data: ReceiptData): Promise<{ success: boolean; message: string }> {
    const bytes = generateEscPosBytes(data);

    // 1. Android Native App Bridge
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (!bridge.isBluetoothEnabled()) {
        return {
          success: false,
          message: "Bluetooth OFF hai. Kripya phone ka Bluetooth ON karein.",
        };
      }
      if (!bridge.hasPermissions()) {
        bridge.requestPermissions();
        return {
          success: false,
          message: "Bluetooth permission allow karein aur dubara print karein.",
        };
      }

      const base64 = uint8ArrayToBase64(bytes);
      const resRaw = bridge.print(this.deviceAddress || "", base64);
      try {
        const res = JSON.parse(resRaw);
        if (res.success) {
          this.status = "connected";
          if (res.deviceName) this.deviceName = res.deviceName;
          if (res.deviceAddress) this.deviceAddress = res.deviceAddress;
          if (typeof window !== "undefined" && res.deviceName) {
            localStorage.setItem("last_printer_name", res.deviceName);
            if (res.deviceAddress) localStorage.setItem("last_printer_address", res.deviceAddress);
          }
          this.notify();
        }
        return res;
      } catch (e: any) {
        return { success: false, message: "Print response parse error: " + (e.message || "") };
      }
    }

    // 2. Web Bluetooth flow
    if (this.isConnected()) {
      return await this.sendBytes(bytes);
    }

    const connRes = await this.connect();
    if (!connRes.success) {
      return connRes;
    }

    return await this.sendBytes(bytes);
  }

  // Print Agent Hisab automatically
  public async printAgentHisab(data: AgentHisabPrintData): Promise<{ success: boolean; message: string }> {
    const bytes = generateAgentHisabEscPosBytes(data);

    // 1. Android Native App Bridge
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (!bridge.isBluetoothEnabled()) {
        return {
          success: false,
          message: "Bluetooth OFF hai. Kripya phone ka Bluetooth ON karein.",
        };
      }
      if (!bridge.hasPermissions()) {
        bridge.requestPermissions();
        return {
          success: false,
          message: "Bluetooth permission allow karein aur dubara print karein.",
        };
      }

      const base64 = uint8ArrayToBase64(bytes);
      const resRaw = bridge.print(this.deviceAddress || "", base64);
      try {
        const res = JSON.parse(resRaw);
        if (res.success) {
          this.status = "connected";
          if (res.deviceName) this.deviceName = res.deviceName;
          if (res.deviceAddress) this.deviceAddress = res.deviceAddress;
          this.notify();
        }
        return res;
      } catch (e: any) {
        return { success: false, message: "Print response parse error: " + (e.message || "") };
      }
    }

    // 2. Web Bluetooth flow
    if (this.isConnected()) {
      return await this.sendBytes(bytes);
    }

    const connRes = await this.connect();
    if (!connRes.success) {
      return connRes;
    }

    return await this.sendBytes(bytes);
  }
}

export const printerManager = new BluetoothPrinterManager();

// React Hook to observe Printer Connection Status
export function usePrinter() {
  const [status, setStatus] = useState<PrinterStatus>(printerManager.status);
  const [deviceName, setDeviceName] = useState<string | null>(printerManager.deviceName);

  useEffect(() => {
    const unsub = printerManager.subscribe(() => {
      setStatus(printerManager.status);
      setDeviceName(printerManager.deviceName);
    });
    return unsub;
  }, []);

  return {
    status,
    deviceName,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    connect: () => printerManager.connect(),
    disconnect: () => printerManager.disconnect(),
    print: (data: ReceiptData) => printerManager.print(data),
    printAgentHisab: (data: AgentHisabPrintData) => printerManager.printAgentHisab(data),
  };
}

// Fallback System Print
export function printViaSystem() {
  window.print();
}

// Clean 58mm Thermal Print using an isolated hidden iframe
export function printReceiptHtml(htmlContent: string) {
  if (typeof window === "undefined") return;

  const existingFrame = document.getElementById("receipt-print-iframe");
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.id = "receipt-print-iframe";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Thermal Receipt Print</title>
  <style>
    @page {
      size: 48mm auto;
      margin: 0;
    }
    @media print {
      html, body {
        width: 48mm !important;
        max-width: 48mm !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .receipt-wrapper {
        width: 48mm !important;
        max-width: 48mm !important;
        margin: 0 auto !important;
        padding: 2mm 1mm !important;
      }
    }
    body {
      width: 48mm;
      max-width: 48mm;
      margin: 0 auto;
      padding: 3px 2px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.25;
      color: #000;
      background: #fff;
      word-break: break-word;
    }
    * {
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div class="receipt-wrapper">
    ${htmlContent}
  </div>
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("Iframe print error:", e);
      window.print();
    }
  }, 250);
}

export function generateAgentHisabHtml(data: AgentHisabPrintData): string {
  return `
    <div style="width: 48mm; max-width: 48mm; margin: 0 auto; box-sizing: border-box; font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.3; color: #000; word-break: break-word;">
      <!-- Header -->
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 5px;">
        <div style="font-size: 15px; font-weight: 900; letter-spacing: 1px;">PLAY ON</div>
        <div style="font-size: 10px; font-weight: bold; text-transform: uppercase;">AGENT HISAB PARCHI</div>
        <div style="font-size: 9px; color: #333;">Date: ${data.dateStr}</div>
      </div>

      <!-- Agent & Market Info -->
      <div style="font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>Agent:</span>
          <span>${data.agentName}</span>
        </div>
        ${data.phone ? `
        <div style="display: flex; justify-content: space-between; font-size: 9.5px;">
          <span>Mobile:</span>
          <span>${data.phone}</span>
        </div>` : ""}
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>Bazar:</span>
          <span style="max-width: 28mm; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${data.marketName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 9.5px;">
          <span>Plays:</span>
          <span>${data.playCount} Bets</span>
        </div>
      </div>

      <!-- Breakdown Table -->
      <div style="font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Total Sale:</span>
          <span style="font-weight: bold;">Rs.${data.totalSale.toLocaleString("en-IN")}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Comm (${data.commissionRate}%):</span>
          <span style="font-weight: bold;">Rs.${data.totalCommission.toLocaleString("en-IN")}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Winning:</span>
          <span style="font-weight: bold;">Rs.${data.totalWinning.toLocaleString("en-IN")}</span>
        </div>
      </div>

      <!-- Total Box -->
      <div style="text-align: center; padding: 4px; border: 1px solid #000; margin-bottom: 6px;">
        <div style="font-size: 9px; font-weight: bold; text-transform: uppercase;">TOTAL AMOUNT</div>
        <div style="font-size: 16px; font-weight: 900;">Rs.${data.totalAmount.toLocaleString("en-IN")}</div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; font-size: 8.5px; padding-top: 2px;">
        *** Thank You for Playing ***
      </div>
    </div>
  `;
}

export function printAgentHisabViaSystem(data: AgentHisabPrintData) {
  const html = generateAgentHisabHtml(data);
  printReceiptHtml(html);
}
