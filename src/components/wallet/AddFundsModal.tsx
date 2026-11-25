import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, CheckCircle2, QrCode, ArrowDownLeft, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { usePaymentSettings, useSubmitDeposit, useMyDeposits } from "@/hooks/useWallet";
import { useAuth, useProfile } from "@/hooks/useAuth";

interface AddFundsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddFundsModal({ open, onOpenChange }: AddFundsModalProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: settings } = usePaymentSettings();
  const { mutate: submitDeposit, isPending } = useSubmitDeposit();
  const { data: myDeposits } = useMyDeposits(user?.id);

  const [amount, setAmount] = useState<number>(500);
  const [utrNumber, setUtrNumber] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [tab, setTab] = useState<"add" | "history">("add");

  const upiId = settings?.upi_id || "admin@upi";
  const minDeposit = settings?.min_deposit || 100;
  const maxDeposit = settings?.max_deposit || 50000;

  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    toast.success("UPI ID copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < minDeposit) {
      toast.error(`Minimum deposit amount is ₹${minDeposit}`);
      return;
    }
    if (amount > maxDeposit) {
      toast.error(`Maximum deposit amount is ₹${maxDeposit}`);
      return;
    }
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      toast.error("Please enter a valid 12-digit UTR / Ref Number from your payment receipt");
      return;
    }

    submitDeposit(
      { amount, utr_number: cleanUtr },
      {
        onSuccess: () => {
          toast.success("Deposit request submitted! Admin will verify and add points within 5-10 mins.");
          setUtrNumber("");
          setTab("history");
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit deposit request");
        },
      }
    );
  };

  // Generate UPI payment QR URL (standard UPI protocol)
  const upiPayUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(settings?.account_name || "Game Admin")}&am=${amount}&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiPayUrl)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border p-4 sm:p-6 text-foreground">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gold">
              <ArrowDownLeft className="h-5 w-5 text-emerald-400" />
              Add Money / Deposit Points
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Current Balance: <span className="font-bold text-foreground">₹{profile?.points ?? 0}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Tab switch */}
        <div className="flex rounded-lg bg-muted/40 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("add")}
            className={`flex-1 rounded-md py-1.5 transition-colors ${tab === "add" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            Deposit Money
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex-1 rounded-md py-1.5 transition-colors ${tab === "history" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            My Requests ({myDeposits?.length || 0})
          </button>
        </div>

        {tab === "add" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick Amount Buttons */}
            <div>
              <Label className="text-xs text-muted-foreground">Select Amount</Label>
              <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    className={`rounded-md border py-1.5 text-xs font-bold transition-all ${
                      amount === amt
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    +₹{amt}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-bold text-muted-foreground">₹</span>
                <Input
                  type="number"
                  min={minDeposit}
                  max={maxDeposit}
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder={`Min ₹${minDeposit}`}
                  className="font-bold text-foreground"
                />
              </div>
            </div>

            {/* UPI ID & QR Code Section */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3 text-center space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Scan QR with PhonePe / GPay / Paytm:</span>
                <span className="text-[10px] text-emerald-400 font-bold">Fast Auto QR</span>
              </div>

              {/* Dynamic QR Code */}
              <div className="flex justify-center">
                <div className="rounded-lg bg-white p-2 shadow-md">
                  <img
                    src={qrCodeUrl}
                    alt="Scan UPI QR"
                    className="h-36 w-36 sm:h-40 sm:w-40"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* UPI ID with Copy Button */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                <div className="text-left">
                  <p className="text-[10px] text-muted-foreground">Official UPI ID:</p>
                  <p className="font-mono font-bold text-foreground select-all">{upiId}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyUpi}
                  className="h-8 gap-1 text-xs"
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            {/* Step 2: Enter UTR */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>Enter 12-Digit UTR / Ref Number:</span>
                <span className="text-[10px] text-amber-400">Required after payment</span>
              </Label>
              <Input
                type="text"
                placeholder="e.g. 432587129043"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                maxLength={24}
                className="font-mono tracking-wider"
                required
              />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0 text-amber-400" />
                Payment app (GPay/PhonePe/Paytm) ki receipt se 12-digit UTR yahan enter karein.
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isPending || !amount || !utrNumber.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 shadow-md"
            >
              {isPending ? "Submitting..." : `Submit Deposit Request (₹${amount})`}
            </Button>
          </form>
        ) : (
          /* Recent Deposit Requests List */
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {myDeposits?.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted-foreground">No deposit requests yet.</p>
            ) : (
              myDeposits?.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">₹{req.amount}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          req.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : req.status === "rejected"
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">UTR: {req.utr_number}</p>
                    {req.rejection_reason && (
                      <p className="text-[10px] text-rose-400 mt-0.5">Reason: {req.rejection_reason}</p>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {new Date(req.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    <br />
                    {new Date(req.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
