"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Database,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wifi,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { Department, IngredientRow, StaffRole, StockLedgerRow } from "@/lib/types/database";
import { resolveBusinessDate } from "@/lib/utils/dateHelper";

type AiProvider = "gemini" | "groq" | "openrouter" | "cohere" | "mistral" | "standby";
type AiPriority = "high" | "medium" | "low";
type AiRiskLevel = "high" | "medium" | "low";
type AiClassification = "fast_moving" | "low_moving";

interface AiAnalyzeContextRow {
  product_id: string;
  product_name: string;
  department: Department;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  stock_status: "low_stock" | "ok";
  daily_usage_7d: Record<string, number>;
  total_usage_7d: number;
  average_daily_usage: number;
  recommended_order_qty: number;
  supplier_name: string;
  business_date_range: {
    usage_start_date: string;
    usage_end_date: string;
  };
}

interface AiAnalyzeResult {
  analysis?: string;
  summary: {
    total_products: number;
    fast_moving_count: number;
    low_moving_count: number;
    critical_stock_count: number;
    [key: string]: unknown;
  };
  purchase_orders: {
    product_id: string | number | null;
    product_name: string;
    recommended_qty: number;
    priority?: AiPriority;
    reason: string;
    [key: string]: unknown;
  }[];
  inventory_control: {
    product_id: string | number | null;
    product_name: string;
    current_stock: number | null;
    recommended_action: string;
    risk_level: AiRiskLevel;
    [key: string]: unknown;
  }[];
  product_classification: {
    product_id: string | number | null;
    product_name: string;
    classification: AiClassification;
    reason: string;
    [key: string]: unknown;
  }[];
}

interface AiAnalyzeApiResponse {
  success: boolean;
  provider: string;
  model?: string;
  result: AiAnalyzeResult;
}

interface AiAnalyzeErrorResponse {
  error?: {
    code?: string;
    message?: string;
    attempts?: { provider: string; model: string; error: string }[];
  };
}

type IngredientWithSupplier = Pick<
  IngredientRow,
  | "id"
  | "name"
  | "department"
  | "unit"
  | "current_stock"
  | "minimum_stock"
  | "primary_supplier_id"
  | "is_active"
  | "is_stock_tracked"
> & {
  supplier?: { id: string; name: string } | { id: string; name: string }[] | null;
};

type LedgerForContext = Pick<
  StockLedgerRow,
  "ingredient_id" | "business_date" | "theoretical_usage" | "closing_stock" | "in_qty" | "adjustment_qty"
>;

const AI_DASHBOARD_ROLES: StaffRole[] = ["master_admin", "admin", "op_manager"];
const LOOKBACK_DAYS = 7;
const COVERAGE_DAYS = 7;

const PROVIDER_META: Record<
  AiProvider,
  {
    name: string;
    shortName: string;
    modelHint: string;
    markClass: string;
    badgeClass: string;
  }
> = {
  gemini: {
    name: "Gemini",
    shortName: "G",
    modelHint: "gemini-2.5-flash",
    markClass: "bg-cyan-500 text-white",
    badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-700",
  },
  groq: {
    name: "Groq",
    shortName: "GQ",
    modelHint: "llama3-8b-8192",
    markClass: "bg-teal-500 text-white",
    badgeClass: "border-teal-200 bg-teal-50 text-teal-700",
  },
  openrouter: {
    name: "OpenRouter",
    shortName: "OR",
    modelHint: "meta-llama/llama-3-8b-instruct:free",
    markClass: "border border-slate-200 bg-slate-100 text-slate-900",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-700",
  },
  cohere: {
    name: "Cohere",
    shortName: "CH",
    modelHint: "command-r",
    markClass: "bg-emerald-500 text-white",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  mistral: {
    name: "Mistral",
    shortName: "M",
    modelHint: "open-mixtral-8x22b",
    markClass: "bg-orange-500 text-white",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
  },
  standby: {
    name: "AI Standby",
    shortName: "AI",
    modelHint: "Menunggu analisis",
    markClass: "border border-slate-200 bg-slate-100 text-slate-700",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
  },
};

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-";
  return numberFormatter.format(value);
}

function toProductId(value: string | number | null): string {
  if (value == null || value === "") return "-";
  return String(value);
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDateKeys(endDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDaysIso(endDate, index - (days - 1)));
}

function normalizeSupplierName(
  supplier?: { id: string; name: string } | { id: string; name: string }[] | null,
): string {
  const row = Array.isArray(supplier) ? supplier[0] : supplier;
  return row?.name ?? "-";
}

function getProviderMeta(provider?: string): (typeof PROVIDER_META)[AiProvider] {
  const key = (provider ?? "standby").toLowerCase() as AiProvider;
  return PROVIDER_META[key] ?? PROVIDER_META.standby;
}

function isWrappedAnalyzeResponse(data: AiAnalyzeApiResponse | AiAnalyzeResult): data is AiAnalyzeApiResponse {
  return Boolean((data as AiAnalyzeApiResponse).result);
}

function getWrappedAnalyzeResponse(data: AiAnalyzeApiResponse | AiAnalyzeResult): AiAnalyzeApiResponse {
  if (isWrappedAnalyzeResponse(data)) return data;
  return {
    success: true,
    provider: "standby",
    result: data,
  };
}

function buildAnalysisNarrative(result: AiAnalyzeResult): string {
  if (result.analysis?.trim()) return result.analysis.trim();

  const topPo = result.purchase_orders[0];
  const topRisk = result.inventory_control[0];

  return [
    `AI membaca ${formatNumber(result.summary.total_products)} produk inventory. Terdapat ${formatNumber(
      result.summary.fast_moving_count,
    )} fast moving, ${formatNumber(result.summary.low_moving_count)} low moving, dan ${formatNumber(
      result.summary.critical_stock_count,
    )} stok kritis yang perlu dipantau.`,
    topPo
      ? `Prioritas PO utama saat ini adalah ${topPo.product_name} dengan rekomendasi qty ${formatNumber(
          topPo.recommended_qty,
        )}. Alasan AI: ${topPo.reason}`
      : "Belum ada rekomendasi PO prioritas dari AI untuk data saat ini.",
    topRisk
      ? `Kontrol inventory yang perlu diperhatikan: ${topRisk.product_name}. ${topRisk.recommended_action}`
      : "Belum ada risiko inventory khusus yang perlu ditindaklanjuti.",
  ].join("\n\n");
}

function buildContextRows(
  ingredients: IngredientWithSupplier[],
  ledgerRows: LedgerForContext[],
  dateKeys: string[],
): AiAnalyzeContextRow[] {
  const ledgerByIngredient = new Map<string, LedgerForContext[]>();

  for (const row of ledgerRows) {
    const rows = ledgerByIngredient.get(row.ingredient_id) ?? [];
    rows.push(row);
    ledgerByIngredient.set(row.ingredient_id, rows);
  }

  return ingredients.slice(0, 120).map((ingredient) => {
    const rows = ledgerByIngredient.get(ingredient.id) ?? [];
    const dailyUsage = Object.fromEntries(dateKeys.map((date) => [date, 0])) as Record<string, number>;

    for (const row of rows) {
      dailyUsage[row.business_date] = (dailyUsage[row.business_date] ?? 0) + Number(row.theoretical_usage ?? 0);
    }

    const totalUsage = Object.values(dailyUsage).reduce((sum, value) => sum + value, 0);
    const averageDailyUsage = totalUsage / Math.max(1, dateKeys.length);
    const currentStock = Number(ingredient.current_stock ?? 0);
    const minimumStock = Number(ingredient.minimum_stock ?? 0);
    const recommendedOrderQty = Math.max(
      0,
      Math.ceil(minimumStock + averageDailyUsage * COVERAGE_DAYS - currentStock),
    );

    return {
      product_id: ingredient.id,
      product_name: ingredient.name,
      department: ingredient.department,
      unit: ingredient.unit,
      current_stock: currentStock,
      minimum_stock: minimumStock,
      stock_status: currentStock <= minimumStock ? "low_stock" : "ok",
      daily_usage_7d: dailyUsage,
      total_usage_7d: totalUsage,
      average_daily_usage: averageDailyUsage,
      recommended_order_qty: recommendedOrderQty,
      supplier_name: normalizeSupplierName(ingredient.supplier),
      business_date_range: {
        usage_start_date: dateKeys[0],
        usage_end_date: dateKeys[dateKeys.length - 1],
      },
    };
  });
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Package;
  tone: "teal" | "cyan" | "amber" | "rose";
}) {
  const toneClass = {
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function DashboardContent() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const autoAnalyzeStartedRef = useRef(false);
  const [dataContext, setDataContext] = useState<AiAnalyzeContextRow[]>([]);
  const [apiResponse, setApiResponse] = useState<AiAnalyzeApiResponse | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const result = apiResponse?.result ?? null;
  const activeProvider = apiResponse?.provider ?? "standby";
  const providerMeta = getProviderMeta(activeProvider);

  const fastMovingProducts = useMemo(
    () => result?.product_classification.filter((item) => item.classification === "fast_moving") ?? [],
    [result],
  );
  const lowMovingProducts = useMemo(
    () => result?.product_classification.filter((item) => item.classification === "low_moving") ?? [],
    [result],
  );
  const analysisNarrative = useMemo(() => (result ? buildAnalysisNarrative(result) : ""), [result]);

  const loadDataContext = useCallback(async () => {
    if (!supabase) {
      setIsLoadingContext(false);
      setError("Supabase belum dikonfigurasi.");
      return [];
    }

    setIsLoadingContext(true);
    setError(null);

    const usageEnd = resolveBusinessDate();
    const dateKeys = getDateKeys(usageEnd, LOOKBACK_DAYS);
    const usageStart = dateKeys[0];

    try {
      const [ingredientResult, ledgerResult] = await Promise.all([
        supabase
          .from("ingredient")
          .select(
            "id, name, department, unit, current_stock, minimum_stock, primary_supplier_id, is_active, is_stock_tracked, supplier:primary_supplier_id ( id, name )",
          )
          .eq("is_active", true)
          .eq("is_stock_tracked", true)
          .order("name"),
        supabase
          .from("stock_ledger")
          .select("ingredient_id, business_date, theoretical_usage, closing_stock, in_qty, adjustment_qty")
          .gte("business_date", usageStart)
          .lte("business_date", usageEnd),
      ]);

      const loadError = ingredientResult.error ?? ledgerResult.error;
      if (loadError) {
        setError(loadError.message);
        setDataContext([]);
        return [];
      }

      const rows = buildContextRows(
        (ingredientResult.data ?? []) as IngredientWithSupplier[],
        (ledgerResult.data ?? []) as LedgerForContext[],
        dateKeys,
      );

      setDataContext(rows);
      return rows;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat data context inventory.");
      setDataContext([]);
      return [];
    } finally {
      setIsLoadingContext(false);
    }
  }, [supabase]);

  const runAnalyze = useCallback(
    async (rows: AiAnalyzeContextRow[] = dataContext) => {
      if (rows.length === 0) {
        setError("Data inventory belum tersedia untuk dianalisis.");
        return;
      }

      setIsAnalyzing(true);
      setError(null);

      try {
        const response = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataContext: rows }),
        });
        const data = (await response.json()) as AiAnalyzeApiResponse | AiAnalyzeResult | AiAnalyzeErrorResponse;
        const providerError = "error" in data ? data.error : undefined;

        if (!response.ok || providerError) {
          throw new Error(providerError?.message || `AI analyze gagal dengan status ${response.status}.`);
        }

        setApiResponse(getWrappedAnalyzeResponse(data as AiAnalyzeApiResponse | AiAnalyzeResult));
        setLastUpdatedAt(
          new Intl.DateTimeFormat("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date()),
        );
      } catch (analyzeError) {
        setApiResponse(null);
        setError(analyzeError instanceof Error ? analyzeError.message : "AI analyze gagal diproses.");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [dataContext],
  );

  useEffect(() => {
    void loadDataContext();
  }, [loadDataContext]);

  useEffect(() => {
    if (autoAnalyzeStartedRef.current || isLoadingContext || dataContext.length === 0) return;
    autoAnalyzeStartedRef.current = true;
    void runAnalyze(dataContext);
  }, [dataContext, isLoadingContext, runAnalyze]);

  const handleRefresh = async () => {
    autoAnalyzeStartedRef.current = true;
    const rows = await loadDataContext();
    if (rows.length > 0) {
      await runAnalyze(rows);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/master-data"
              className="mb-5 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Dashboard Admin
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  Artha AI Inventory Insights
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Dashboard analisis AI untuk PO, kontrol inventory, dan klasifikasi pergerakan produk.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:min-w-72">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                </span>
                <span className="text-sm font-semibold text-slate-800">AI aktif</span>
              </div>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                Terhubung
              </span>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              {lastUpdatedAt ? `Update terakhir ${lastUpdatedAt}` : "Siap menjalankan analisis inventory."}
            </p>
          </div>
        </header>

        {error ? (
          <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
          <MetricCard
            label="Produk Dibaca"
            value={formatNumber(result?.summary.total_products ?? dataContext.length)}
            icon={Database}
            tone="cyan"
          />
          <MetricCard
            label="Fast Moving"
            value={formatNumber(result?.summary.fast_moving_count ?? 0)}
            icon={TrendingUp}
            tone="teal"
          />
          <MetricCard
            label="Low Moving"
            value={formatNumber(result?.summary.low_moving_count ?? 0)}
            icon={TrendingDown}
            tone="amber"
          />
          <MetricCard
            label="Stok Kritis"
            value={formatNumber(result?.summary.critical_stock_count ?? 0)}
            icon={AlertTriangle}
            tone="rose"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md lg:col-span-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${providerMeta.markClass}`}>
                  {providerMeta.shortName}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-500">Provider aktif</p>
                  <h2 className="mt-1 truncate text-lg font-semibold text-slate-950">{providerMeta.name}</h2>
                </div>
              </div>
              <Wifi className="h-5 w-5 text-teal-500" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-500">Status</span>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                  {isAnalyzing ? "Menganalisis" : "Terhubung"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-500">Model</span>
                <span className="truncate text-right text-sm font-medium text-slate-700">
                  {apiResponse?.model ?? providerMeta.modelHint}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-500">Data context</span>
                <span className="text-sm font-medium text-slate-700">{formatNumber(dataContext.length)} row</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runAnalyze()}
              disabled={isLoadingContext || isAnalyzing || dataContext.length === 0}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Bot className="h-4 w-4" aria-hidden="true" />
              )}
              {isAnalyzing ? "Menganalisis data..." : "Run AI Analysis"}
            </button>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isLoadingContext || isAnalyzing}
              className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingContext ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Refresh Data Context
            </button>
          </div>

          <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md lg:col-span-8">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-teal-700">Analysis Summary</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Narasi analisis AI</h2>
              </div>
              <ShieldCheck className="h-5 w-5 text-teal-500" aria-hidden="true" />
            </div>
            {isAnalyzing && !result ? (
              <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-teal-600" aria-hidden="true" />
                AI sedang membaca data inventory...
              </div>
            ) : result ? (
              <div className="whitespace-pre-line text-sm leading-7 text-slate-700">{analysisNarrative}</div>
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm leading-6 text-slate-500">
                Analisis akan tampil otomatis setelah data context siap.
              </div>
            )}
          </article>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-teal-700">Purchase Order Recommendation</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">Rekomendasi PO dari AI</h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
              {formatNumber(result?.purchase_orders.length ?? 0)} item
            </span>
          </div>
          <div className="max-h-[calc(100vh-6rem)] overflow-auto scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Product ID</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Product Name</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-600">
                    Recommended Qty
                  </th>
                  <th className="min-w-80 px-5 py-3 font-semibold text-slate-600">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {result?.purchase_orders.length ? (
                  result.purchase_orders.map((item, index) => (
                    <tr
                      key={`${toProductId(item.product_id)}-${index}`}
                      className="transition hover:bg-cyan-50/70"
                    >
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-medium text-slate-900">
                        {toProductId(item.product_id)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{item.product_name}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-slate-900">
                        {formatNumber(item.recommended_qty)}
                      </td>
                      <td className="px-5 py-4 font-medium leading-6 text-slate-900">{item.reason}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm font-medium text-slate-600">
                      Belum ada rekomendasi PO. Jalankan analisis AI untuk menampilkan data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-teal-700">Fast Moving</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Produk cepat bergerak</h2>
              </div>
              <TrendingUp className="h-5 w-5 text-teal-500" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap gap-2">
              {fastMovingProducts.length > 0 ? (
                fastMovingProducts.map((item, index) => (
                  <span
                    key={`${toProductId(item.product_id)}-fast-${index}`}
                    title={`${item.product_name}: ${item.reason}`}
                    className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 transition hover:-translate-y-0.5 hover:bg-teal-100"
                  >
                    {toProductId(item.product_id)}
                  </span>
                ))
              ) : (
                <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Belum ada produk fast moving.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-700">Low Moving</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Produk lambat bergerak</h2>
              </div>
              <TrendingDown className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap gap-2">
              {lowMovingProducts.length > 0 ? (
                lowMovingProducts.map((item, index) => (
                  <span
                    key={`${toProductId(item.product_id)}-low-${index}`}
                    title={`${item.product_name}: ${item.reason}`}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:-translate-y-0.5 hover:bg-amber-100"
                  >
                    {toProductId(item.product_id)}
                  </span>
                ))
              ) : (
                <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  Belum ada produk low moving.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function ArthaAiInventoryInsightsPage() {
  return (
    <ProtectedRoute allowedRoles={AI_DASHBOARD_ROLES}>
      <DashboardContent />
    </ProtectedRoute>
  );
}
