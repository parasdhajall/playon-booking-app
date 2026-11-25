import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  Settings,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  type PaymentSettings,
  useAdminDeposits,
  useAdminWithdrawals,
  useAdminDepositActions,
  useAdminWithdrawalActions,
  usePaymentSettings,
  useUpdatePaymentSettings,
} from "@/hooks/useWallet";

export function AdminWalletManagement() {
  const [subTab, setSubTab] = useState<"deposits" | "withdrawals" | "settings">("deposits");
  const [depositFilter, setDepositFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [withdrawFilter, setWithdrawFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  const { data: deposits, isLoading: loadingDeposits, refetch: refetchDeposits } = useAdminDeposits(depositFilter);
  const { data: withdrawals, isLoading: loadingWithdrawals, refetch: refetchWithdrawals } = useAdminWithdrawals(withdrawFilter);
  const { data: settings, refetch: refetchSettings } = usePaymentSettings();

  const { approve: approveDeposit, reject: rejectDeposit } = useAdminDepositActions();
  const { approve: approveWithdrawal, reject: rejectWithdrawal } = useAdminWithdrawalActions();
  const { mutate: updateSettings, isPending: savingSettings } = useUpdatePaymentSettings();

  // Settings form state
  const [editUpi, setEditUpi] = useState<string>(settings?.upi_id || "");
  const [editName, setEditName] = useState<string>(settings?.account_name || "");
  const [minDep, setMinDep] = useState<number>(settings?.min_deposit || 100);
  const [minWith, setMinWith] = useState<number>(settings?.min_withdrawal || 500);

  const handleApproveDeposit = (id: string, amount: number) => {
    if (!window.confirm(`Are you sure you want to approve this deposit of ₹${amount}? Points will be credited to user immediately.`)) {
      return;
    }
    approveDeposit.mutate(id, {
      onSuccess: () => toast.success(`Deposit of ₹${amount} approved & points credited!`),
      onError: (err: any) => toast.error(err.message || "Approval failed"),
    });
  };

  const handleRejectDeposit = (id: string) => {
    const reason = window.prompt("Reason for rejection:", "UTR invalid or payment not received");
    if (!reason) return;
    rejectDeposit.mutate(
      { requestId: id, reason },
      {
        onSuccess: () => toast.success("Deposit rejected"),
        onError: (err: any) => toast.error(err.message || "Rejection failed"),
      }
    );
  };

  const handleApproveWithdrawal = (id: string, amount: number, upi: string) => {
    if (!window.confirm(`Have you transferred ₹${amount} to UPI: ${upi}? Click OK to mark as Approved/Paid.`)) {
      return;
    }
    approveWithdrawal.mutate(id, {
      onSuccess: () => toast.success(`Withdrawal of ₹${amount} marked as Paid!`),
      onError: (err: any) => toast.error(err.message || "Approval failed"),
    });
  };

  const handleRejectWithdrawal = (id: string, amount: number) => {
    const reason = window.prompt("Reason for rejecting withdrawal (Points will be refunded to user):", "Invalid UPI ID / Bank issue");
    if (!reason) return;
    rejectWithdrawal.mutate(
      { requestId: id, reason },
      {
        onSuccess: () => toast.success(`Withdrawal rejected. ₹${amount} refunded back to user!`),
        onError: (err: any) => toast.error(err.message || "Rejection failed"),
      }
    );
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<PaymentSettings> = {
      upi_id: editUpi.trim(),
      account_name: editName.trim(),
      min_deposit: minDep,
      min_withdrawal: minWith,
    };
    if (settings?.id) {
      payload.id = settings.id;
    }
    updateSettings(payload, {
      onSuccess: () => toast.success("Payment settings updated successfully!"),
      onError: (err: any) => toast.error(err.message || "Failed to update settings"),
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const pendingDepositsCount = deposits?.filter((d) => d.status === "pending").length ?? 0;
  const pendingWithdrawalsCount = withdrawals?.filter((w) => w.status === "pending").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Sub Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            size="sm"
            variant={subTab === "deposits" ? "default" : "outline"}
            onClick={() => setSubTab("deposits")}
            className="h-8 gap-1.5 text-xs font-bold"
          >
            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
            Deposit Requests
            {pendingDepositsCount > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10px] text-black font-extrabold">
                {pendingDepositsCount}
              </span>
            )}
          </Button>

          <Button
            size="sm"
            variant={subTab === "withdrawals" ? "default" : "outline"}
            onClick={() => setSubTab("withdrawals")}
            className="h-8 gap-1.5 text-xs font-bold"
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-amber-400" />
            Withdrawal Requests
            {pendingWithdrawalsCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] text-black font-extrabold">
                {pendingWithdrawalsCount}
              </span>
            )}
          </Button>

          <Button
            size="sm"
            variant={subTab === "settings" ? "default" : "outline"}
            onClick={() => {
              setEditUpi(settings?.upi_id || "");
              setEditName(settings?.account_name || "");
              setMinDep(settings?.min_deposit || 100);
              setMinWith(settings?.min_withdrawal || 500);
              setSubTab("settings");
            }}
            className="h-8 gap-1 text-xs"
          >
            <Settings className="h-3.5 w-3.5" />
            UPI QR Settings
          </Button>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => {
            refetchDeposits();
            refetchWithdrawals();
            refetchSettings();
            toast.success("Wallet data refreshed");
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* 1. DEPOSIT REQUESTS TAB */}
      {subTab === "deposits" && (
        <div className="space-y-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-semibold">Filter:</span>
            {(["pending", "approved", "rejected", "all"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setDepositFilter(st)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                  depositFilter === st
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* List */}
          {loadingDeposits ? (
            <p className="py-12 text-center text-xs text-muted-foreground">Loading deposits...</p>
          ) : deposits?.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400/40 mb-2" />
              <p className="text-sm font-semibold">No {depositFilter} deposit requests found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deposits?.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl border border-border bg-card p-3 sm:p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-foreground">₹{req.amount}</span>
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
                      <span className="text-muted-foreground">
                        User: <strong className="text-foreground">{req.profiles?.display_name || "Player"}</strong> (Bal: ₹{req.profiles?.points ?? 0})
                      </span>
                    </div>

                    {/* UTR with copy */}
                    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      <span>UTR: <strong className="text-gold select-all">{req.utr_number}</strong></span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(req.utr_number, "UTR")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {new Date(req.created_at).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>

                    {req.rejection_reason && (
                      <p className="text-[10px] text-rose-400">Rejected reason: {req.rejection_reason}</p>
                    )}
                  </div>

                  {/* Action buttons (only for pending) */}
                  {req.status === "pending" && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        onClick={() => handleApproveDeposit(req.id, req.amount)}
                        disabled={approveDeposit.isPending}
                        className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve (+₹{req.amount})
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectDeposit(req.id)}
                        disabled={rejectDeposit.isPending}
                        className="flex-1 sm:flex-none text-xs h-8 gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. WITHDRAWAL REQUESTS TAB */}
      {subTab === "withdrawals" && (
        <div className="space-y-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground font-semibold">Filter:</span>
            {(["pending", "approved", "rejected", "all"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setWithdrawFilter(st)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                  withdrawFilter === st
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* List */}
          {loadingWithdrawals ? (
            <p className="py-12 text-center text-xs text-muted-foreground">Loading withdrawals...</p>
          ) : withdrawals?.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
              <CheckCircle2 className="mx-auto h-8 w-8 text-amber-400/40 mb-2" />
              <p className="text-sm font-semibold">No {withdrawFilter} withdrawal requests found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawals?.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl border border-border bg-card p-3 sm:p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-amber-400">₹{req.amount}</span>
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
                      <span className="text-muted-foreground">
                        User: <strong className="text-foreground">{req.profiles?.display_name || "Player"}</strong>
                      </span>
                    </div>

                    {/* Destination UPI with copy */}
                    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      <span>Send to UPI: <strong className="text-foreground select-all">{req.upi_id}</strong></span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(req.upi_id || "", "UPI ID")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>

                    {req.account_holder_name && (
                      <p className="text-[11px] text-muted-foreground">Name: {req.account_holder_name}</p>
                    )}

                    <p className="text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {new Date(req.created_at).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>

                    {req.rejection_reason && (
                      <p className="text-[10px] text-rose-400">Rejected reason: {req.rejection_reason}</p>
                    )}
                  </div>

                  {/* Action buttons (only for pending) */}
                  {req.status === "pending" && (
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        onClick={() => handleApproveWithdrawal(req.id, req.amount, req.upi_id || "")}
                        disabled={approveWithdrawal.isPending}
                        className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Mark Paid & Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectWithdrawal(req.id, req.amount)}
                        disabled={rejectWithdrawal.isPending}
                        className="flex-1 sm:flex-none text-xs h-8 gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject & Refund
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. SETTINGS TAB */}
      {subTab === "settings" && (
        <form onSubmit={handleSaveSettings} className="rounded-xl border border-border bg-card p-4 space-y-4 max-w-lg">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Official Payment & UPI Configuration</h3>
            <p className="text-xs text-muted-foreground">
              These details and QR code are displayed to users when they click "Add Money".
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Admin Receiving UPI ID</Label>
            <Input
              type="text"
              placeholder="e.g. yourname@upi or 9876543210@paytm"
              value={editUpi}
              onChange={(e) => setEditUpi(e.target.value)}
              className="font-mono text-sm"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Account Holder Display Name</Label>
            <Input
              type="text"
              placeholder="e.g. Official Booking Wallet"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Min Deposit (₹)</Label>
              <Input
                type="number"
                value={minDep}
                onChange={(e) => setMinDep(Number(e.target.value))}
                min={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Min Withdrawal (₹)</Label>
              <Input
                type="number"
                value={minWith}
                onChange={(e) => setMinWith(Number(e.target.value))}
                min={100}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={savingSettings || !editUpi.trim()}
            className="w-full bg-primary font-bold text-xs h-9"
          >
            {savingSettings ? "Saving Settings..." : "Save Payment Settings"}
          </Button>
        </form>
      )}
    </div>
  );
}
