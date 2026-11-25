import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { pannaDigit } from "@/lib/matka";
import { Calendar, BarChart2, RefreshCw } from "lucide-react";

interface MarketChartModalProps {
  market: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarketChartModal({ market, open, onOpenChange }: MarketChartModalProps) {
  const { data: chartData = [], isLoading, refetch } = useQuery({
    queryKey: ["market-chart", market?.id],
    enabled: !!market?.id && open,
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("*")
        .eq("market_id", market!.id)
        .order("result_date", { ascending: false })
        .limit(60);

      if (error) throw error;

      // Group by result_date
      const dateMap = new Map<string, { openPanna?: string; closePanna?: string }>();
      for (const row of data || []) {
        const d = row.result_date;
        const entry = dateMap.get(d) || {};
        if (row.session === "open") entry.openPanna = row.panna;
        if (row.session === "close") entry.closePanna = row.panna;
        dateMap.set(d, entry);
      }

      return Array.from(dateMap.entries()).map(([date, res]) => {
        const oDigit = res.openPanna ? pannaDigit(res.openPanna) : null;
        const cDigit = res.closePanna ? pannaDigit(res.closePanna) : null;
        const jodi = oDigit !== null && cDigit !== null ? `${oDigit}${cDigit}` : oDigit !== null ? `${oDigit}*` : "--";
        return {
          date,
          openPanna: res.openPanna || "***",
          jodi,
          closePanna: res.closePanna || "***",
        };
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-5 bg-card border-border rounded-2xl shadow-2xl">
        <DialogHeader className="pb-3 border-b border-border/50 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center text-gold">
                <BarChart2 className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  {market?.name} Panel Chart
                </DialogTitle>
                <p className="text-xs text-muted-foreground">Recent declared results & Jodi numbers</p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Refresh results"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </DialogHeader>

        <div className="my-2 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading {market?.name} panel records…
            </div>
          ) : chartData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No historical results found yet for this market.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-center text-xs">
                <thead className="bg-secondary/70 text-muted-foreground uppercase font-bold tracking-wider">
                  <tr>
                    <th className="py-2 px-3 text-left">Date</th>
                    <th className="py-2 px-2">Open</th>
                    <th className="py-2 px-2 text-gold">Jodi</th>
                    <th className="py-2 px-2">Close</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {chartData.map((row) => (
                    <tr key={row.date} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-2 px-3 text-left font-sans text-muted-foreground text-[11px] whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="py-2 px-2 font-bold text-foreground">{row.openPanna}</td>
                      <td className="py-2 px-2 font-extrabold text-gold text-sm bg-gold/5">{row.jodi}</td>
                      <td className="py-2 px-2 font-bold text-foreground">{row.closePanna}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}