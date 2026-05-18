import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (typeof window === "undefined") {
      throw new Error(
        "Supabase env tidak tersedia saat build. Set NEXT_PUBLIC_SUPABASE_* di .env.local atau gunakan dynamic import SSR off."
      );
    }
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local"
    );
  }

  browserClient = createClient<Database>(url, anonKey);
  return browserClient;
}

/** Mengembalikan null jika env belum di-set (aman untuk build & SSR). */
export function getSupabaseClientOrNull(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (browserClient) return browserClient;
  browserClient = createClient<Database>(url, anonKey);
  return browserClient;
}
