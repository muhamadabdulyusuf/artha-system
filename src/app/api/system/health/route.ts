import { getAiProviderStatuses } from "@/lib/ai/providers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type HealthState = "ok" | "degraded" | "error";

type HealthCheck = {
  status: HealthState;
  message: string;
  latencyMs?: number;
};

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function computeOverallStatus(checks: HealthCheck[]): HealthState {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "ok";
}

async function timedCheck(run: () => Promise<HealthCheck>): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const result = await run();
    return { ...result, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Health check gagal.",
      latencyMs: Date.now() - startedAt,
    };
  }
}

export async function GET() {
  const supabaseConfigured = hasEnv("NEXT_PUBLIC_SUPABASE_URL") && hasEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleConfigured = hasEnv("SUPABASE_SERVICE_ROLE_KEY");
  const aiProviders = getAiProviderStatuses();
  const configuredAiProviders = aiProviders.filter((provider) => provider.configured);

  const supabaseConnection = await timedCheck(async () => {
    if (!supabaseConfigured) {
      return {
        status: "error",
        message: "NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum tersedia.",
      };
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("ingredient").select("id", { count: "exact", head: true });
    if (error) {
      return { status: "error", message: `Supabase query gagal: ${error.message}` };
    }

    return {
      status: serviceRoleConfigured ? "ok" : "degraded",
      message: serviceRoleConfigured
        ? "Supabase terkoneksi dengan service role."
        : "Supabase terkoneksi memakai anon key; service role belum diset.",
    };
  });

  const aiMemoryTable = await timedCheck(async () => {
    if (!supabaseConfigured) {
      return {
        status: "error",
        message: "Supabase belum siap, tabel ai_business_memory tidak bisa dicek.",
      };
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("ai_business_memory").select("id", { count: "exact", head: true });
    if (error) {
      return {
        status: "degraded",
        message: "Tabel ai_business_memory belum terbaca. Jalankan migration 041 jika belum.",
      };
    }

    return { status: "ok", message: "Tabel ai_business_memory tersedia." };
  });

  const aiProviderCheck: HealthCheck = {
    status: configuredAiProviders.length > 0 ? "ok" : "degraded",
    message:
      configuredAiProviders.length > 0
        ? `${configuredAiProviders.length}/${aiProviders.length} AI provider siap dikonfigurasi.`
        : "Belum ada AI provider key yang tersedia.",
  };

  const checks = [supabaseConnection, aiMemoryTable, aiProviderCheck];
  const status = computeOverallStatus(checks);

  return Response.json({
    status,
    generatedAt: new Date().toISOString(),
    checks: {
      supabase: {
        ...supabaseConnection,
        configured: supabaseConfigured,
        serviceRoleConfigured,
      },
      aiMemoryTable,
      aiProviders: {
        ...aiProviderCheck,
        configuredCount: configuredAiProviders.length,
        totalCount: aiProviders.length,
        providers: aiProviders,
      },
    },
  });
}
