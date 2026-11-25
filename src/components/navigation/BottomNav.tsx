import { Link, useRouterState } from "@tanstack/react-router";
import { Home, History, BookOpen, Wallet, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface BottomNavProps {
  onOpenPassbook: () => void;
  onOpenWallet: () => void;
}

export function BottomNav({ onOpenPassbook, onOpenWallet }: BottomNavProps) {
  const { user } = useAuth();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  // Hide bottom nav on active game play screen so sticky bet action bar has full unobstructed view
  if (pathname.startsWith("/play")) {
    return null;
  }

  const isHome = pathname === "/";
  const isHistory = pathname.startsWith("/history");

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur-lg shadow-2xl py-1.5 px-2 max-w-lg mx-auto sm:hidden">
      <div className="flex items-center justify-around">
        {/* 1. Home */}
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            isHome ? "text-gold font-bold scale-105" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className={`h-5 w-5 ${isHome ? "text-gold stroke-[2.5]" : ""}`} />
          <span className="text-[10px] tracking-wide">Home</span>
        </Link>

        {/* 2. My Bids */}
        {user ? (
          <Link
            to="/history"
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
              isHistory ? "text-gold font-bold scale-105" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className={`h-5 w-5 ${isHistory ? "text-gold stroke-[2.5]" : ""}`} />
            <span className="text-[10px] tracking-wide">My Bids</span>
          </Link>
        ) : (
          <Link
            to="/auth"
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-muted-foreground hover:text-foreground transition-all"
          >
            <History className="h-5 w-5" />
            <span className="text-[10px] tracking-wide">My Bids</span>
          </Link>
        )}

        {/* 3. Passbook Ledger */}
        <button
          onClick={user ? onOpenPassbook : undefined}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-muted-foreground hover:text-gold transition-all cursor-pointer"
        >
          <BookOpen className="h-5 w-5 text-gold/90" />
          <span className="text-[10px] tracking-wide">Passbook</span>
        </button>

        {/* 4. Wallet */}
        <button
          onClick={user ? onOpenWallet : undefined}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-muted-foreground hover:text-emerald-400 transition-all cursor-pointer"
        >
          <Wallet className="h-5 w-5 text-emerald-400" />
          <span className="text-[10px] tracking-wide">Wallet</span>
        </button>

        {/* 5. Support WhatsApp */}
        <a
          href="https://wa.me/918143175017?text=Hello%20PLAYON%20Support"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-muted-foreground hover:text-emerald-500 transition-all cursor-pointer"
        >
          <MessageCircle className="h-5 w-5 text-emerald-500" />
          <span className="text-[10px] tracking-wide">Support</span>
        </a>
      </div>
    </nav>
  );
}