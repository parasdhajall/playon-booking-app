import { Link, useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Home,
  History,
  Wallet,
  BookOpen,
  TrendingUp,
  MessageCircle,
  Phone,
  Shield,
  LogOut,
  LogIn,
  ChevronRight,
  PlusCircle,
  ArrowUpRight,
  User,
  Sparkles,
  Smartphone,
} from "lucide-react";

interface AppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAddFunds: () => void;
  onOpenWithdraw: () => void;
  onOpenPassbook: () => void;
  onOpenGameRates: () => void;
}

export function AppDrawer({
  open,
  onOpenChange,
  onOpenAddFunds,
  onOpenWithdraw,
  onOpenPassbook,
  onOpenGameRates,
}: AppDrawerProps) {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    onOpenChange(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const displayName = profile?.display_name || user?.email?.replace("@playon.app", "") || "Guest Player";
  const mobileNumber = profile?.phone || user?.email?.replace("@playon.app", "") || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[85vw] max-w-xs p-0 bg-card border-r border-border/70 flex flex-col justify-between">
        <div className="flex-1 overflow-y-auto">
          {/* Header & User Profile Card */}
          <SheetHeader className="p-4 bg-gradient-to-br from-secondary/80 via-secondary/40 to-card border-b border-border/60 text-left">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gold/20 border border-gold/40 flex items-center justify-center font-black text-xl text-gold shadow-inner shrink-0">
                {user ? displayName.slice(0, 1).toUpperCase() : "7"}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base text-foreground truncate">{displayName}</h3>
                <p className="text-xs font-mono text-muted-foreground truncate">
                  {user ? (mobileNumber ? `+91 ${mobileNumber}` : "Logged In") : "Welcome to Playon777"}
                </p>
                {profile?.isAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 border border-gold/40 px-2 py-0.2 text-[10px] font-extrabold text-gold tracking-wider mt-0.5">
                    👑 MASTER ADMIN
                  </span>
                )}
              </div>
            </div>

            {/* Quick Wallet Card inside Drawer */}
            {user && (
              <div className="mt-3.5 p-3 rounded-xl bg-background/90 border border-gold/30 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Wallet className="h-3 w-3 text-emerald-400" /> Wallet Balance
                  </span>
                  <span className="font-display text-xl font-extrabold text-gold">
                    ₹{profile?.points ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40">
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      onOpenAddFunds();
                    }}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <PlusCircle className="h-3.5 w-3.5" /> Add Cash
                  </button>
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      onOpenWithdraw();
                    }}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" /> Withdraw
                  </button>
                </div>
              </div>
            )}
          </SheetHeader>

          {/* Navigation Links */}
          <div className="p-3 space-y-1 text-sm font-medium">
            {profile?.isAdmin && (
              <Link
                to="/admin"
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gold/15 border border-gold/40 text-gold font-bold hover:bg-gold/25 transition-colors mb-1 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-gold" />
                  <span>Admin Control Panel</span>
                </div>
                <ChevronRight className="h-4 w-4 text-gold" />
              </Link>
            )}

            <Link
              to="/"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors"
            >
              <div className="flex items-center gap-3">
                <Home className="h-4 w-4 text-gold" />
                <span>Home & Markets</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </Link>

            {user && (
              <>
                <Link
                  to="/history"
                  onClick={() => onOpenChange(false)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <History className="h-4 w-4 text-primary" />
                    <span>My Bids & History</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </Link>

                <button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenPassbook();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-gold" />
                    <span>Passbook Ledger</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </button>

                <button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenAddFunds();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <PlusCircle className="h-4 w-4 text-emerald-400" />
                    <span>Add Money (Deposit)</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </button>

                <button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenWithdraw();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <ArrowUpRight className="h-4 w-4 text-amber-400" />
                    <span>Withdraw Points</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </button>
              </>
            )}

            <button
              onClick={() => {
                onOpenChange(false);
                onOpenGameRates();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span>Game Rates & Payouts</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </button>

            {/* Direct Android APK Download */}
            <a
              href="/Playon777.apk"
              download="Playon777.apk"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold hover:brightness-110 transition-all shadow-xs"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-emerald-400" />
                <span>Download Playon777 App</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 font-mono">
                APK
              </span>
            </a>

            {/* Direct Support links */}
            <a
              href="https://wa.me/918143175017?text=Hello%20Playon777%20Support"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <span>WhatsApp Customer Care</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>

            <a
              href="tel:+918143175017"
              className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors"
            >
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-blue-400" />
                <span>Call Helpline (+91 8143175017)</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </a>

            {/* Admin Console Link */}
            {profile?.isAdmin && (
              <Link
                to="/admin"
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gold/15 border border-gold/40 text-gold font-bold hover:bg-gold/25 transition-colors mt-2"
              >
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-gold" />
                  <span>Admin Control Panel</span>
                </div>
                <ChevronRight className="h-4 w-4 text-gold" />
              </Link>
            )}
          </div>
        </div>

        {/* Footer (Sign In / Sign Out) */}
        <div className="p-4 border-t border-border/60 bg-secondary/20">
          {user ? (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-bold transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          ) : (
            <Link
              to="/auth"
              onClick={() => onOpenChange(false)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow transition-colors"
            >
              <LogIn className="h-4 w-4" /> Sign In to Play
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}