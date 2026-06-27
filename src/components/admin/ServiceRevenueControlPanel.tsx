"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, Loader2, Percent, RefreshCw, Save } from "lucide-react";
import { canManageStaffAccounts } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";

type RevenueState = {
  grossRevenue: number;
  serviceAmount: number;
  taxAmount: number;
  totalWithService: number;
  grandTotal: number;
  quantitySold: number;
  salesLineCount: number;
};

type SoldLineRevenueJoin = {
  quantity_sold: number;
  menu_item: { price: number } | { price: number }[] | null;
};

type NoticeState = { variant: "success" | "error"; message: string } | null;

const DEFAULT_REVENUE: RevenueState = {
  grossRevenue: 0,
  serviceAmount: 0,
  taxAmount: 0,
  totalWithService: 0,
  grandTotal: 0,
  quantitySold: 0,
  salesLineCount: 0,
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(monthKey: string): { startDate: string; endDate: string } {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(year, month, 0).getDate();

  return {
    startDate: `${yearText}-${monthText}-01`,
    endDate: `${yearText}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function formatMonthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split("-");
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(Number(yearText), Number(monthText) - 1, 1)
  );
}

function parsePercentInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}

function formatPercentInput(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function resolveJoinedMenu(
  value: SoldLineRevenueJoin["menu_item"]
): { price: number } | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function ServiceRevenueControlPanel() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const session = getStaffSession();
  const canManageService = canManageStaffAccounts(session?.role);
  const [monthKey, setMonthKey] = useState(() => getCurrentMonthKey());
  const [servicePercentInput, setServicePercentInput] = useState("0");
  const [taxPercentInput, setTaxPercentInput] = useState("0");
  const [savedServicePercent, setSavedServicePercent] = useState(0);
  const [savedTaxPercent, setSavedTaxPercent] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<RevenueState>(DEFAULT_REVENUE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  const activeServicePercent = parsePercentInput(servicePercentInput) ?? savedServicePercent;
  const activeTaxPercent = parsePercentInput(taxPercentInput) ?? savedTaxPercent;
  const monthLabel = formatMonthLabel(monthKey);

  const loadServiceFlow = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    let nextServicePercent = savedServicePercent;
    let nextTaxPercent = savedTaxPercent;

    const { data: setting, error: settingError } = await supabase
      .from("service_charge_setting")
      .select("id, service_percent, tax_percent, updated_at")
      .eq("id", "default")
      .maybeSingle();

    if (settingError) {
      setNotice({
        variant: "error",
        message: `Gagal memuat persen service/tax. Pastikan migration 050 sudah dijalankan. Detail: ${settingError.message}`,
      });
    } else if (setting) {
      nextServicePercent = Number(setting.service_percent ?? 0);
      nextTaxPercent = Number(setting.tax_percent ?? 0);
      setSavedServicePercent(nextServicePercent);
      setSavedTaxPercent(nextTaxPercent);
      setServicePercentInput(formatPercentInput(nextServicePercent));
      setTaxPercentInput(formatPercentInput(nextTaxPercent));
      setLastUpdatedAt(setting.updated_at ?? null);
    } else {
      nextServicePercent = 0;
      nextTaxPercent = 0;
      setSavedServicePercent(0);
      setSavedTaxPercent(0);
      setServicePercentInput("0");
      setTaxPercentInput("0");
      setLastUpdatedAt(null);
    }

    const { startDate, endDate } = getMonthRange(monthKey);
    const { data: sessions, error: sessionError } = await supabase
      .from("worksheet_session")
      .select("id")
      .gte("business_date", startDate)
      .lte("business_date", endDate);

    if (sessionError) {
      setRevenue(DEFAULT_REVENUE);
      setNotice({ variant: "error", message: `Gagal memuat periode revenue: ${sessionError.message}` });
      setIsLoading(false);
      return;
    }

    const sessionIds = (sessions ?? []).map((row) => row.id);
    if (sessionIds.length === 0) {
      setRevenue(DEFAULT_REVENUE);
      setIsLoading(false);
      return;
    }

    const { data: soldLines, error: soldError } = await supabase
      .from("worksheet_sold_line")
      .select("quantity_sold, menu_item:menu_item_id ( price )")
      .in("session_id", sessionIds);

    if (soldError) {
      setRevenue(DEFAULT_REVENUE);
      setNotice({ variant: "error", message: `Gagal memuat revenue sales menu: ${soldError.message}` });
      setIsLoading(false);
      return;
    }

    let grossRevenue = 0;
    let quantitySold = 0;
    let salesLineCount = 0;

    for (const line of (soldLines ?? []) as SoldLineRevenueJoin[]) {
      const qty = Number(line.quantity_sold ?? 0);
      const menu = resolveJoinedMenu(line.menu_item);
      const price = Number(menu?.price ?? 0);
      if (qty <= 0 || price < 0) continue;

      grossRevenue += qty * price;
      quantitySold += qty;
      salesLineCount += 1;
    }

    const serviceAmount = grossRevenue * (nextServicePercent / 100);
    const totalWithService = grossRevenue + serviceAmount;
    const taxAmount = totalWithService * (nextTaxPercent / 100);
    setRevenue({
      grossRevenue,
      serviceAmount,
      taxAmount,
      totalWithService,
      grandTotal: totalWithService + taxAmount,
      quantitySold,
      salesLineCount,
    });
    setIsLoading(false);
  }, [monthKey, savedServicePercent, savedTaxPercent, supabase]);

  useEffect(() => {
    void loadServiceFlow();
  }, [loadServiceFlow]);

  useEffect(() => {
    const serviceAmount = revenue.grossRevenue * (activeServicePercent / 100);
    const totalWithService = revenue.grossRevenue + serviceAmount;
    const taxAmount = totalWithService * (activeTaxPercent / 100);
    setRevenue((current) => ({
      ...current,
      serviceAmount,
      taxAmount,
      totalWithService,
      grandTotal: totalWithService + taxAmount,
    }));
  }, [activeServicePercent, activeTaxPercent, revenue.grossRevenue]);

  const saveServiceAndTaxPercent = async () => {
    if (!canManageService) {
      setNotice({ variant: "error", message: "Hanya Master Admin yang bisa mengubah persen service dan tax." });
      return;
    }

    const nextServicePercent = parsePercentInput(servicePercentInput);
    const nextTaxPercent = parsePercentInput(taxPercentInput);
    if (nextServicePercent == null) {
      setNotice({ variant: "error", message: "Persen service wajib angka 0 sampai 100." });
      return;
    }
    if (nextTaxPercent == null) {
      setNotice({ variant: "error", message: "Persen tax wajib angka 0 sampai 100." });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const { error } = await supabase.from("service_charge_setting").upsert(
      {
        id: "default",
        service_percent: nextServicePercent,
        tax_percent: nextTaxPercent,
        updated_by_staff_id: session?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      setNotice({
        variant: "error",
        message: `Gagal menyimpan persen service/tax. Pastikan migration 050 sudah dijalankan. Detail: ${error.message}`,
      });
      setIsSaving(false);
      return;
    }

    setSavedServicePercent(nextServicePercent);
    setSavedTaxPercent(nextTaxPercent);
    setServicePercentInput(formatPercentInput(nextServicePercent));
    setTaxPercentInput(formatPercentInput(nextTaxPercent));
    setLastUpdatedAt(new Date().toISOString());
    setNotice({
      variant: "success",
      message: "Persen service dan tax tersimpan. Perhitungan bulan ini langsung dihitung ulang.",
    });
    setIsSaving(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-bold text-slate-900">Service Revenue Control</h2>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Pantau revenue menu bulan berjalan, atur persen service, dan tax otomatis untuk total tagihan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadServiceFlow()}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {notice ? (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.variant === "success"
              ? "border-teal-200 bg-teal-50 text-teal-700"
              : "border-red-500/40 bg-red-500/10 text-red-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Revenue {monthLabel}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatRupiah(revenue.grossRevenue)}</p>
          <p className="mt-1 text-xs text-slate-600">{revenue.quantitySold.toLocaleString("id-ID")} menu terjual</p>
        </div>
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Service Aktif</p>
          <p className="mt-2 text-2xl font-bold text-teal-700">{activeServicePercent.toLocaleString("id-ID")}%</p>
          <p className="mt-1 text-xs text-teal-700">Bisa disesuaikan Master Admin</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Estimasi Service</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatRupiah(revenue.serviceAmount)}</p>
          <p className="mt-1 text-xs text-slate-600">Revenue x service percent</p>
        </div>
        <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Tax Aktif</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatRupiah(revenue.taxAmount)}</p>
          <p className="mt-1 text-xs text-teal-700">{activeTaxPercent.toLocaleString("id-ID")}% dari subtotal + service</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Grand Total</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatRupiah(revenue.grandTotal)}</p>
          <p className="mt-1 text-xs text-slate-600">{revenue.salesLineCount.toLocaleString("id-ID")} line sales</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
        <label className="block">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <CalendarDays className="h-4 w-4 text-slate-600" />
            Periode Revenue
          </span>
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value || getCurrentMonthKey())}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
          />
        </label>

        <label className="block">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Percent className="h-4 w-4 text-slate-600" />
            Persen Service
          </span>
          <div className="relative mt-1">
            <input
              inputMode="decimal"
              value={servicePercentInput}
              onChange={(event) => setServicePercentInput(event.target.value)}
              disabled={!canManageService}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:opacity-60"
              placeholder="Contoh: 5"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-600">
              %
            </span>
          </div>
        </label>

        <label className="block">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Percent className="h-4 w-4 text-slate-600" />
            Persen Tax
          </span>
          <div className="relative mt-1">
            <input
              inputMode="decimal"
              value={taxPercentInput}
              onChange={(event) => setTaxPercentInput(event.target.value)}
              disabled={!canManageService}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:opacity-60"
              placeholder="Contoh: 10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-600">
              %
            </span>
          </div>
        </label>

        <button
          type="button"
          onClick={() => void saveServiceAndTaxPercent()}
          disabled={!canManageService || isSaving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Service & Tax
        </button>
      </div>

      <p className="text-xs leading-relaxed text-slate-600">
        Revenue dihitung dari Menu Sales yang sudah tersimpan di worksheet. Tax dihitung dari subtotal setelah service.
        Terakhir update service/tax:{" "}
        {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("id-ID") : "-"}.
      </p>
    </section>
  );
}
