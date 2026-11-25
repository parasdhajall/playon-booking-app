import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentSettings {
  id: string;
  upi_id: string;
  account_name: string;
  qr_image_url: string;
  min_deposit: number;
  max_deposit: number;
  min_withdrawal: number;
  max_withdrawal: number;
  deposit_notice: string;
  withdrawal_notice: string;
  is_deposit_active: boolean;
  is_withdrawal_active: boolean;
}

export interface DepositRequest {
  id: string;
  user_id: string;
  amount: number;
  utr_number: string;
  screenshot_url?: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
  profiles?: {
    display_name?: string;
    points?: number;
  };
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  payout_method: "upi" | "bank";
  upi_id?: string;
  account_holder_name?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
  profiles?: {
    display_name?: string;
    points?: number;
  };
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: "deposit" | "withdrawal" | "bet_placed" | "bet_won" | "admin_adjustment" | "withdrawal_refund";
  amount: number;
  balance_after: number;
  reference_id?: string;
  description: string;
  created_at: string;
}

// 1. Fetch Payment Settings (Admin QR, UPI ID, Limits)
export function usePaymentSettings() {
  return useQuery({
    queryKey: ["payment_settings"],
    queryFn: async (): Promise<PaymentSettings> => {
      const { data, error } = await supabase
        .from("payment_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("Could not fetch payment_settings:", error);
        return {
          id: "default",
          upi_id: "paytmqr2810050501011@paytm",
          account_name: "Official Booking Wallet",
          qr_image_url: "",
          min_deposit: 100,
          max_deposit: 50000,
          min_withdrawal: 500,
          max_withdrawal: 50000,
          deposit_notice: "Payment ke baad 12-digit UTR/Ref Number daalein. Points 5-10 min mein credit ho jayenge.",
          withdrawal_notice: "Withdrawal timing: 10:00 AM to 08:00 PM. Instant UPI transfer.",
          is_deposit_active: true,
          is_withdrawal_active: true,
        };
      }

      return data as unknown as PaymentSettings;
    },
  });
}

// 2. Submit Deposit Request (User submitting UTR)
export function useSubmitDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ amount, utr_number }: { amount: number; utr_number: string }) => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) throw new Error("Please sign in first");

      const cleanUtr = utr_number.trim();
      if (!cleanUtr || cleanUtr.length < 6) {
        throw new Error("Please enter a valid 12-digit UTR or Transaction Ref Number");
      }

      const { data, error } = await supabase.from("deposit_requests" as any).insert({
        user_id: authData.user.id,
        amount,
        utr_number: cleanUtr,
        status: "pending",
      } as any).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_deposits"] });
      qc.invalidateQueries({ queryKey: ["wallet_transactions"] });
    },
  });
}

// 3. Submit Withdrawal Request (User withdrawing points to UPI)
export function useSubmitWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ amount, upi_id, account_holder }: { amount: number; upi_id: string; account_holder?: string }) => {
      const { data, error } = await supabase.rpc("submit_withdrawal_request" as any, {
        p_amount: amount,
        p_upi_id: upi_id.trim(),
        p_account_holder: account_holder?.trim() || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["my_withdrawals"] });
      qc.invalidateQueries({ queryKey: ["wallet_transactions"] });
    },
  });
}

// 4. Fetch User's Deposits
export function useMyDeposits(userId?: string) {
  return useQuery({
    queryKey: ["my_deposits", userId],
    enabled: !!userId,
    queryFn: async (): Promise<DepositRequest[]> => {
      const { data, error } = await supabase
        .from("deposit_requests" as any)
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as DepositRequest[];
    },
  });
}

// 5. Fetch User's Withdrawals
export function useMyWithdrawals(userId?: string) {
  return useQuery({
    queryKey: ["my_withdrawals", userId],
    enabled: !!userId,
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      const { data, error } = await supabase
        .from("withdrawal_requests" as any)
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as WithdrawalRequest[];
    },
  });
}

// 6. Fetch User's Wallet Ledger / Passbook Transactions
export function useWalletTransactions(userId?: string) {
  return useQuery({
    queryKey: ["wallet_transactions", userId],
    enabled: !!userId,
    queryFn: async (): Promise<WalletTransaction[]> => {
      const { data, error } = await supabase
        .from("wallet_transactions" as any)
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as unknown as WalletTransaction[];
    },
  });
}

// 7. ADMIN: Fetch Pending / Recent Deposit Requests
export function useAdminDeposits(statusFilter?: "pending" | "approved" | "rejected" | "all") {
  return useQuery({
    queryKey: ["admin_deposits", statusFilter],
    queryFn: async (): Promise<DepositRequest[]> => {
      let query = supabase
        .from("deposit_requests" as any)
        .select("*, profiles:user_id(display_name, points)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as DepositRequest[];
    },
  });
}

// 8. ADMIN: Fetch Pending / Recent Withdrawal Requests
export function useAdminWithdrawals(statusFilter?: "pending" | "approved" | "rejected" | "all") {
  return useQuery({
    queryKey: ["admin_withdrawals", statusFilter],
    queryFn: async (): Promise<WithdrawalRequest[]> => {
      let query = supabase
        .from("withdrawal_requests" as any)
        .select("*, profiles:user_id(display_name, points)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as WithdrawalRequest[];
    },
  });
}

// 9. ADMIN: Approve / Reject Deposit
export function useAdminDepositActions() {
  const qc = useQueryClient();

  const approve = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("approve_deposit_request" as any, {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_deposits"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const reject = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_deposit_request" as any, {
        p_request_id: requestId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_deposits"] });
    },
  });

  return { approve, reject };
}

// 10. ADMIN: Approve / Reject Withdrawal
export function useAdminWithdrawalActions() {
  const qc = useQueryClient();

  const approve = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("approve_withdrawal_request" as any, {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_withdrawals"] });
    },
  });

  const reject = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_withdrawal_request" as any, {
        p_request_id: requestId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_withdrawals"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  return { approve, reject };
}

// 11. ADMIN: Update Payment Settings (UPI ID, QR, Limits)
export function useUpdatePaymentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<PaymentSettings>) => {
      const { data, error } = await supabase
        .from("payment_settings" as any)
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settings.id || "")
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_settings"] });
    },
  });
}
