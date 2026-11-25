import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUpRight, Clock, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { usePaymentSettings, useSubmitWithdrawal, useMyWithdrawals } from "@/hooks/useWallet";
import { useAuth, useProfile } from "@/hooks/useAuth";

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WithdrawModal({ open, onOpenChange }: WithdrawModalProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: settings } = usePaymentSettings();
  const { mutate: submitWithdrawal, isPending } = useSubmitWithdrawal();
  const { data: myWithdrawals } = useMyWithdrawals(user?.id);

  const [amount, setAmount] = useState<number>(500);
  const [upiId, setUpiId] = useState<string>("");
  const [accountHolder, setAccountHolder] = useState<string>("");
  const [tab, setTab] = useState<"withdraw" | "history">("withdraw");

  const minWithdrawal = settings?.min_withdrawal || 500;
  const maxWithdrawal = settings?.max_withdrawal || 50000;
  const availablePoints = profile?.points ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < minWithdrawal) {
      toast.error(`Minimum withdrawal amount is ₹${minWithdrawal}`);
      return;
    }
    if (amount > maxWithdrawal) {
      toast.error(`Maximum withdrawal limit is ₹${maxWithdrawal}`);
      return;
    }
    if (amount > availablePoints) {
      toast.error(`Insufficient balance. You have ₹${availablePoints}`);
      return;
    }
    const cleanUpi = upiId.trim();
    if (!cleanUpi || !cleanUpi.includes("@")) {
      toast.error("Please enter a valid UPI ID (e.g. yourname@upi or 9876543210@paytm)");
      return;
    }

    submitWithdrawal(
      { amount, upi_id: cleanUpi, account_holder: accountHolder.trim() },
      {
        onSuccess: () => {
          toast.success(`Withdrawal request of ₹${amount} submitted! Points will be sent to your UPI.`);
          setUpiId("");
          setAccountHolder("");
          setTab("history");
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to submit withdrawal request");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border p-4 sm:p-6 text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gold">
            <ArrowUpRight className="h-5 w-5 text-amber-400" />
            Withdraw Money / Nikaasi
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Available Balance: <span className="font-bold text-emerald-400">₹{availablePoints}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Tab switch */}
        <div className="flex rounded-lg bg-muted/40 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("withdraw")}
            className={`flex-1 rounded-md py-1.5 transition-colors ${tab === "withdraw" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            Withdraw Points
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`flex-1 rounded-md py-1.5 transition-colors ${tab === "history" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            Past Withdrawals ({myWithdrawals?.length || 0})
          </button>
        </div>

        {tab === "withdraw" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Withdrawal Amount (₹)</Label>
                <button
                  type="button"
                  onClick={() => setAmount(availablePoints)}
                  className="text-[11px] font-bold text-gold hover:underline"
                >
                  Withdraw All (₹{availablePoints})
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-muted-foreground">₹</span>
                <Input
                  type="number"
                  min={minWithdrawal}
                  max={Math.min(maxWithdrawal, availablePoints)}
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder={`Min ₹${minWithdrawal}`}
                  className="font-bold text-foreground"
                  required
                />
              </div>
            </div>

            {/* UPI ID input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Your UPI ID (PhonePe, GPay, Paytm)</Label>
              <Input
                type="text"
                placeholder="e.g. 9876543210@paytm or name@okaxis"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="font-mono"
                required
              />
            </div>

            {/* Account Holder Name */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account Holder Name (Optional)</Label>
              <Input
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
              />
            </div>

            {/* Notice */}
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200/90 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                {settings?.withdrawal_notice || "Direct transfer to your UPI within 15-30 minutes during payout timings."}
              </span>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isPending || !amount || amount > availablePoints || amount < minWithdrawal || !upiId.trim()}
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold h-10 shadow-md"
            >
              {isPending ? "Processing..." : `Submit Withdrawal Request (₹${amount})`}
            </Button>
          </form>
        ) : (
          /* Past Withdrawals List */
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {myWithdrawals?.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted-foreground">No withdrawal requests yet.</p>
            ) : (
              myWithdrawals?.map((req) => (
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
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">UPI: {req.upi_id}</p>
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
