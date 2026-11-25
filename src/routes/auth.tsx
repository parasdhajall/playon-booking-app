import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Phone, Lock, ArrowRight, ShieldCheck, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In & Register — Playon777" },
      { name: "description", content: "Sign in or register your Playon777 account." },
      { property: "og:title", content: "Sign In — Playon777" },
      { property: "og:description", content: "Sign in with your mobile number to Playon777." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

export function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Helper to format input into valid auth email
  const formatAuthEmail = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === "admin") {
      return "admin@playon.com";
    }
    if (trimmed.includes("@")) {
      return trimmed.toLowerCase();
    }
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) {
      return `${trimmed.toLowerCase()}@playon.app`;
    }
    return `${digits}@playon.app`;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = loginId.trim();
    if (!cleanId) {
      toast.error("Please enter your 10-digit mobile number or admin username");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    setBusy(true);
    const email = formatAuthEmail(cleanId);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);

    if (error) {
      if (
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid_grant")
      ) {
        toast.error("Invalid login credentials. Please check your username/mobile and password.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success("Welcome back to Playon777!");
    if (email.includes("admin")) {
      navigate({ to: "/admin" });
    } else {
      navigate({ to: "/" });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = signUpPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!signUpName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (signUpPassword.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setBusy(true);
    const email = `${cleanPhone}@playon.app`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: signUpPassword,
      options: {
        data: {
          display_name: signUpName.trim(),
          phone: cleanPhone,
        },
      },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Account created successfully! Welcome to Playon777.");
    navigate({ to: "/" });
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-8 sm:py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-glow">
        {/* Header */}
        <div className="text-center space-y-2 mb-5">
          <div className="flex justify-center mb-1">
            <span className="font-display text-3xl sm:text-4xl font-black tracking-wider text-gold drop-shadow-sm flex items-center gap-2">
              <span className="inline-block h-8 w-8 rounded-xl bg-gold/20 border border-gold/40 text-gold text-center text-base font-black leading-8">
                7
              </span>
              <span>PLAY<span className="text-foreground">ON</span><span className="text-emerald-400 font-mono text-2xl sm:text-3xl ml-0.5">777</span></span>
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-gold">
            {mode === "signin" ? "Authorized Sign In" : "New Player Registration"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {mode === "signin"
              ? "Enter your 10-digit mobile number or admin credentials"
              : "Register instant player account with mobile number"}
          </p>
        </div>

        {/* Tab Toggle: Sign In vs Sign Up */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/80 p-1 mb-5 border">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              mode === "signin"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              mode === "signup"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* 1. SIGN IN FORM */}
        {mode === "signin" ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Mobile Number or Admin Username</Label>
              <div className="relative flex items-center">
                {/^\d*$/.test(loginId) && loginId.length <= 10 && loginId.length > 0 ? (
                  <>
                    <div className="absolute left-3 flex items-center gap-1 text-xs font-bold text-muted-foreground border-r pr-2 pointer-events-none">
                      <span>+91</span>
                    </div>
                    <Input
                      type="text"
                      placeholder="10-digit mobile number"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value.trim())}
                      className="pl-16 h-11 text-sm font-semibold tracking-wider rounded-xl font-mono"
                      required
                      autoFocus
                    />
                  </>
                ) : (
                  <>
                    <Phone className="absolute left-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Mobile number or admin"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value.trim())}
                      className="pl-9 h-11 text-sm font-semibold rounded-xl"
                      required
                      autoFocus
                    />
                  </>
                )}
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
        ) : (
          /* 2. SIGN UP / REGISTRATION FORM */
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Your Full Name</Label>
              <div className="relative flex items-center">
                <User className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  className="pl-9 h-11 text-sm rounded-xl"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">10-Digit Mobile Number</Label>
              <div className="relative flex items-center">
                <div className="absolute left-3 flex items-center gap-1 text-xs font-bold text-muted-foreground border-r pr-2 pointer-events-none">
                  <span>+91</span>
                </div>
                <Input
                  type="tel"
                  maxLength={10}
                  placeholder="98XXXXXXXX"
                  value={signUpPhone}
                  onChange={(e) => setSignUpPhone(e.target.value.replace(/\D/g, ""))}
                  className="pl-16 h-11 text-sm font-semibold tracking-wider rounded-xl font-mono"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Create Password</Label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="At least 6 characters"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  className="pl-9 h-11 text-sm rounded-xl"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {busy ? (
                "Creating account…"
              ) : (
                <>
                  <UserPlus className="h-4 w-4" /> Register & Play Now
                </>
              )}
            </Button>
          </form>
        )}

        {/* Security & Access Notice */}
        <div className="mt-6 border-t pt-3 text-center">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            256-bit Secure Private Network
          </span>
        </div>
      </div>
    </main>
  );
}
