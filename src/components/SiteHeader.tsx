import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  LogOut,
  User,
  Wallet,
  PlusCircle,
  ArrowUpRight,
  BookOpen,
  MessageCircle,
  TrendingUp,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/hooks/useAuth";
import { getPlayerDisplayName } from "@/lib/matka";
import { AddFundsModal } from "@/components/wallet/AddFundsModal";
import { WithdrawModal } from "@/components/wallet/WithdrawModal";
import { PassbookModal } from "@/components/wallet/PassbookModal";
import { AppDrawer } from "@/components/navigation/AppDrawer";
import { GameRatesModal } from "@/components/modals/GameRatesModal";
import { BottomNav } from "@/components/navigation/BottomNav";

export function SiteHeader() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [passbookOpen, setPassbookOpen] = useState(false);
  const [gameRatesOpen, setGameRatesOpen] = useState(false);

  const playerName = user ? getPlayerDisplayName(user, profile) : "";
  const points = profile?.points ?? 0;

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex max-w-5xl items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5">
          {/* 1. Left Drawer Trigger (Hamburger Menu) */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-xl hover:bg-secondary/60 text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Open Navigation Menu"
            title="Menu"
          >
            <Menu className="h-5 w-5 text-gold" />
          </button>

          {/* 2. Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0 py-0.5" title="PLAYON">
            <span className="font-display text-2xl sm:text-3xl font-black tracking-wider text-gold drop-shadow-sm flex items-center gap-1.5">
              <span className="inline-block h-6 w-6 rounded-lg bg-gold/20 border border-gold/40 text-gold text-center text-xs font-black leading-6">
                P
              </span>
              <span>PLAY<span className="text-foreground">ON</span></span>
            </span>
          </Link>

          {/* 3. Desktop Navigation links */}
          <nav className="hidden sm:flex items-center gap-3 text-xs sm:text-sm text-muted-foreground ml-2">
            <Link to="/" activeProps={{ className: "text-primary font-bold" }} activeOptions={{ exact: true }}>
              Markets
            </Link>
            {user && (
              <>
                <Link to="/history" activeProps={{ className: "text-primary font-bold" }}>
                  My Bets
                </Link>
                <button
                  type="button"
                  onClick={() => setPassbookOpen(true)}
                  className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                >
                  <BookOpen className="h-3.5 w-3.5 text-gold" />
                  <span>Passbook</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setGameRatesOpen(true)}
              className="flex items-center gap-1 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              <span>Game Rates</span>
            </button>

            {profile?.isAdmin && (
              <Link
                to="/admin"
                className="rounded-md border border-gold/40 bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold hover:bg-gold hover:text-background transition-colors"
              >
                Admin
              </Link>
            )}
          </nav>

          {/* 4. Right Action Section */}
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {profile?.isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1 rounded-full border border-gold/50 bg-gold/15 px-2.5 py-1 text-xs font-bold text-gold hover:bg-gold hover:text-slate-950 transition-colors shadow-xs"
                title="Admin Control Panel"
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Admin</span>
              </Link>
            )}

            {user ? (
              <>
                {/* DPSARA Style Wallet Balance Pill */}
                <button
                  type="button"
                  onClick={() => setAddFundsOpen(true)}
                  className="flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-400 hover:bg-emerald-500/25 transition-all cursor-pointer shadow-xs"
                  title="Click to Add Money"
                >
                  <Wallet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="font-mono text-xs font-black">₹{points}</span>
                  <span className="h-4 w-4 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-black shrink-0">
                    +
                  </span>
                </button>

                {/* Quick WhatsApp Support Icon */}
                <a
                  href="https://wa.me/918143175017?text=Hello%20PLAYON%20Support"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all cursor-pointer"
                  title="WhatsApp Support"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>

                {/* Desktop User Name Pill */}
                <div
                  className="hidden md:flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-semibold"
                  title={`Logged in as ${playerName}`}
                >
                  <User className="h-3.5 w-3.5 text-gold shrink-0" />
                  <span className="max-w-[100px] truncate font-bold text-gold">
                    {playerName}
                  </span>
                </div>

                {/* Sign Out Button */}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={signOut} aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs h-8 px-3 shadow">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Slide-out Navigation Drawer */}
      <AppDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onOpenAddFunds={() => setAddFundsOpen(true)}
        onOpenWithdraw={() => setWithdrawOpen(true)}
        onOpenPassbook={() => setPassbookOpen(true)}
        onOpenGameRates={() => setGameRatesOpen(true)}
      />

      {/* Fixed Mobile Bottom Navigation Dock */}
      <BottomNav
        onOpenPassbook={() => setPassbookOpen(true)}
        onOpenWallet={() => setAddFundsOpen(true)}
      />

      {/* Wallet Modals */}
      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
      <WithdrawModal open={withdrawOpen} onOpenChange={setWithdrawOpen} />
      <PassbookModal
        open={passbookOpen}
        onOpenChange={setPassbookOpen}
        onOpenDeposit={() => setAddFundsOpen(true)}
        onOpenWithdraw={() => setWithdrawOpen(true)}
      />

      {/* Game Rates Modal */}
      <GameRatesModal open={gameRatesOpen} onOpenChange={setGameRatesOpen} />
    </>
  );
}