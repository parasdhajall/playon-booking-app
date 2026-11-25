import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, ShieldCheck } from "lucide-react";

interface GameRatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GAME_RATES = [
  { name: "Single Digit", rate: "1 : 9.5", eg: "₹10 ka ₹95", desc: "Choose any digit from 0 to 9" },
  { name: "Jodi Digit", rate: "1 : 95", eg: "₹10 ka ₹950", desc: "Choose 2-digit number (00 - 99)" },
  { name: "Single Panna", rate: "1 : 140", eg: "₹10 ka ₹1,400", desc: "3 unique digits panna (e.g. 123, 245)" },
  { name: "Double Panna", rate: "1 : 280", eg: "₹10 ka ₹2,800", desc: "2 repeated digits panna (e.g. 112, 335)" },
  { name: "Triple Panna", rate: "1 : 700", eg: "₹10 ka ₹7,000", desc: "All 3 same digits (e.g. 111, 222, 777)" },
  { name: "Half Sangam", rate: "1 : 1,000", eg: "₹10 ka ₹10,000", desc: "1 Open digit + Close panna OR vice versa" },
  { name: "Full Sangam", rate: "1 : 10,000", eg: "₹10 ka ₹100,000", desc: "Open panna + Close panna combo" },
];

export function GameRatesModal({ open, onOpenChange }: GameRatesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-5 bg-card border-border/80 rounded-2xl shadow-2xl">
        <DialogHeader className="pb-3 border-b border-border/50 text-left">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center text-gold">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                PLAYON Official Game Rates
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Guaranteed highest market rates & fastest instant payouts
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2.5 my-2 max-h-[65vh] overflow-y-auto pr-1">
          {GAME_RATES.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div>
                <span className="font-semibold text-sm text-foreground block">
                  {item.name}
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  {item.desc}
                </span>
              </div>
              <div className="text-right shrink-0">
                <Badge className="bg-gold/20 text-gold border-gold/40 font-mono text-xs font-bold px-2 py-0.5">
                  {item.rate}
                </Badge>
                <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">
                  {item.eg}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> 100% Trusted & Verified Rates
          </span>
          <span className="font-bold text-foreground">PLAYON</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}