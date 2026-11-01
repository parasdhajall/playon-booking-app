import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Lock, ArrowRight, ShieldCheck, Sparkles, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — PlayOn" },
      { name: "description", content: "Sign in to your authorized PlayOn account." },
      { property: "og:title", content: "Sign In — PlayOn" },
      { property: "og:description", content: "Sign in with your mobile number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

export function AuthPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Helper to format phone into internal auth credential
  const formatAuthEmail = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.includes("@")) {
      return trimmed.toLowerCase();
    }
    const digits = trimmed.replace(/\D/g, "");
    return `${digits}@playon.app`;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = loginId.trim();
    if (!cleanId) {
      toast.error("Please enter your 10-digit mobile number");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    setBusy(true);
    const email = formatAuthEmail(cleanId);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);

    if (error) {
      if (
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid_grant")
      ) {
        toast.error("Invalid mobile number or password. Please verify and try again.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Welcome back!");
    navigate({ to: "/" });
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-glow">
        {/* Header */}
        <div className="text-center space-y-1 mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold border border-gold/40 mb-2 shadow-inner">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="font-display text-4xl tracking-wider text-gold">
            Authorized Sign In
          </h1>
          <p className="text-xs text-muted-foreground">
            Enter your authorized mobile number and password
          </p>
        </div>

        {/* Sign In Form */}
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Mobile Number</Label>
            <div className="relative flex items-center">
              <div className="absolute left-3 flex items-center gap-1 text-xs font-bold text-muted-foreground border-r pr-2">
                <span>+91</span>
              </div>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="pl-16 h-11 text-sm font-semibold tracking-wider rounded-xl"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Password</Label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 h-11 text-sm rounded-xl"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-11 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {busy ? (
              "Signing in…"
            ) : (
              <>
                Sign In to Play <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        {/* Security & Access Notice */}
        <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-center space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary">
            <ShieldCheck className="h-4 w-4 text-gold" />
            <span>Authorized Access Only</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            New player accounts are created and authorized strictly by the Administrator. If you do not have an account, please contact the operator to get access.
          </p>
        </div>

        <div className="mt-5 border-t pt-3 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            256-bit Secure Private Network
          </span>
        </div>
      </div>
    </main>
  );
}
