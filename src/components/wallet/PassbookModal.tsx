import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BookOpen, ArrowDownLeft, ArrowUpRight, Trophy, RefreshCw } from "lucide-react";
import { useWalletTransactions } from "@/hooks/useWallet";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

interface PassbookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDeposit?: () => void;
  onOpenWithdraw?: () => void;
}

export function PassbookModal({ open, onOpenChange, onOpenDeposit, onOpenWithdraw }: PassbookModalProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: transactions, isLoading, refetch } = useWalletTransactions(user?.id);

  const getBadge = (type: string) => {
    switch (type) {
      case "deposit":
        return <span className="flex items-center gap-1 text-emerald-400 font-bold"><ArrowDownLeft className="h-3.5 w-3.5" /> Deposit</span>;
      case "withdrawal":
        return <span className="flex items-center gap-1 text-amber-400 font-bold"><ArrowUpRight className="h-3.5 w-3.5" /> Withdrawal</span>;
      case "bet_won":
        return <span className="flex items-center gap-1 text-purple-400 font-bold"><Trophy className="h-3.5 w-3.5" /> Winning Won</span>;
      case "bet_placed":
        return <span className="flex items-center gap-1 text-rose-400 font-bold">Bet Placed</span>;
      case "withdrawal_refund":
        return <span className="flex items-center gap-1 text-blue-400 font-bold">Refunded</span>;
      default:
        return <span className="text-muted-foreground">{type}</span>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border p-4 sm:p-6 text-foreground">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gold">
              <BookOpen className="h-5 w-5 text-gold" />
              Wallet Passbook & Transaction Ledger
            </DialogTitle>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Complete statement of deposits, bets, winnings, and payouts.
          </DialogDescription>
        </DialogHeader>

        {/* Balance Card with Quick Action Buttons */}
        <div className="rounded-xl border border-gold/30 bg-gold/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase">Current Available Balance</p>
            <p className="font-display text-3xl font-bold text-gold">₹{profile?.points ?? 0}</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onOpenDeposit && (
              <Button
                size="sm"
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenDeposit();
                }}
              >
                + Add Money
              </Button>
            )}
            {onOpenWithdraw && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none border-amber-500/50 text-amber-400 hover:bg-amber-500/10 font-bold text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenWithdraw();
                }}
              >
                Withdraw
              </Button>
            )}
          </div>
        </div>

        {/* Transactions List */}
        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-center py-10 text-xs text-muted-foreground">Loading transactions...</p>
          ) : transactions?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto opacity-30 mb-2" />
              <p className="text-xs">No transactions recorded yet.</p>
            </div>
          ) : (
            transactions?.map((tx) => (
              <div
                key={tx.id}
                className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {getBadge(tx.type)}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground font-medium">{tx.description}</p>
                  <p className="text-[10px] text-muted-foreground">Bal: ₹{tx.balance_after}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono text-sm font-bold ${
                      tx.amount > 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {tx.amount > 0 ? `+₹${tx.amount}` : `-₹${Math.abs(tx.amount)}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
