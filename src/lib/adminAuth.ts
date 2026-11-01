import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export async function adminCreatePlayerAccount({
  displayName,
  phone,
  password,
  initialPoints = 0,
}: {
  displayName: string;
  phone: string;
  password: string;
  initialPoints?: number;
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length !== 10) {
    return { success: false, error: "Please enter a valid 10-digit mobile number." };
  }
  if (!displayName.trim()) {
    return { success: false, error: "Please enter the player's name." };
  }
  if (!password || password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  const SUPABASE_URL =
    (import.meta.env && import.meta.env["VITE_SUPABASE_URL"]) ||
    (typeof process !== "undefined" ? process.env["SUPABASE_URL"] : undefined);
  const SUPABASE_PUBLISHABLE_KEY =
    (import.meta.env && import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]) ||
    (typeof process !== "undefined" ? process.env["SUPABASE_PUBLISHABLE_KEY"] : undefined);

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return { success: false, error: "Supabase configuration missing." };
  }

  // Isolated Supabase Client with NO session persistence so the current Admin session is NEVER signed out!
  const isolatedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const email = `${cleanPhone}@playon.app`;

  const { data, error } = await isolatedClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName.trim(),
        phone: cleanPhone,
      },
    },
  });

  if (error) {
    if (
      error.message.toLowerCase().includes("already registered") ||
      error.message.toLowerCase().includes("user already")
    ) {
      return { success: false, error: `Mobile number +91 ${cleanPhone} is already registered!` };
    }
    return { success: false, error: error.message };
  }

  const newUserId = data.user?.id;
  if (!newUserId) {
    return { success: false, error: "Could not retrieve created user ID." };
  }

  // If admin provided initial points, credit them immediately using admin's active session
  if (initialPoints > 0) {
    try {
      await supabase.rpc("admin_adjust_points" as any, {
        _user_id: newUserId,
        _points: initialPoints,
      });
    } catch (e: any) {
      console.warn("Could not set initial points:", e?.message);
    }
  }

  return { success: true, userId: newUserId };
}
