"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, MenuItemRow } from "@/lib/types/database";
import { formatBusinessDateLabel } from "@/lib/utils/dateHelper";

type MenuMovementPanelProps = {
  startDate: string;
  endDate: string;
  refreshKey: number;
};

type SoldLineJoined = {
  quantity_sold: number;
  menu_item_id: string;
  worksheet_session: { business_date: string; department: Department } | { business_date: string; department: Department }[] | null;
};

type MenuMovementRow = {
  id: string;
  name: string;
  department: Department;
  quantitySold: number;
  revenue: number;
  sharePercent: number;
};

const MAX_ROWS = 6;

function formatQty(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatRupiahCompact(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatBusinessDateLabel(startDate);
  return `${formatBusinessDateLabel(startDate)} - ${formatBusinessDateLabel(endDate)}`;
}

function departmentLabel(department: Department): string {
  return department === "bar" ? "Bar" : "Kitchen";
}

const DONUT_COLORS = {
  fast: ["#34d399", "#22c55e", "#84cc16", "#14b8a6", "#06b6d4", "#60a5fa"],
  low: ["#fbbf24", "#f59e0b", "#fb923c", "#f97316", "#eab308", "#fde68a"],
};

function DonutChart({
  rows,
  tone,
  total,
}: {
  rows: MenuMovementRow[];
  tone: "fast" | "low";
  total: number;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = DONUT_COLORS[tone];

  return (
    <div className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth="16"
        />
        {rows.map((row, index) => {
          const value = total > 0 ? row.quantitySold / total : 0;
          const dash = Math.max(value * circumference, total > 0 ? 1 : 0);
          const strokeDasharray = `${dash} ${circumference - dash}`;
          const strokeDashoffset = -offset;
          offset += dash;
          return (
            <circle
              key={row.id}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-zinc-50">{formatQty(total)}</span>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">sold</span>
      </div>
    </div>
  );
}

function MovementDonut({
  title,
  icon: Icon,
  rows,
  emptyLabel,
  tone,
}: {
  title: string;
  icon: typeof TrendingUp;
  rows: MenuMovementRow[];
  emptyLabel: string;
  tone: "fast" | "low";
}) {
  const total = rows.reduce((sum, row) => sum + row.quantitySold, 0);
  const colors = DONUT_COLORS[tone];

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={tone === "fast" ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-amber-300"} />
          <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
        </div>
        <span className="text-xs text-zinc-500">{rows.length} menu</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
          <DonutChart rows={rows} tone={tone} total={total} />
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={row.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-zinc-100">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                      {row.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {departmentLabel(row.department)} · {formatRupiahCompact(row.revenue)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-200">
                    {formatQty(row.quantitySold)}
                  </span>
                </div>
                <p className="mt-1 text-right text-[11px] tabular-nums text-zinc-500">
                  {row.sharePercent.toFixed(1)}% kontribusi
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function MenuMovementPanel({ startDate, endDate, refreshKey }: MenuMovementPanelProps) {
  const supabase = getSupabaseClient();
  const [departmentFilter, setDepartmentFilter] = useState<Department | "all">("all");
  const [rows, setRows] = useState<MenuMovementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: menus, error: menuErr } = await supabase
      .from("menu_item")
      .select("*")
      .eq("is_active", true)
      .order("menu_name", { ascending: true });

    if (menuErr) {
      setError(menuErr.message);
      setRows([]);
      setIsLoading(false);
      return;
    }

    const menuMap = new Map<string, MenuItemRow>((menus ?? []).map((menu) => [menu.id, menu]));

    const { data: sessions, error: sessionErr } = await supabase
      .from("worksheet_session")
      .select("id, business_date, department")
      .gte("business_date", startDate)
      .lte("business_date", endDate);

    if (sessionErr) {
      setError(sessionErr.message);
      setRows([]);
      setIsLoading(false);
      return;
    }

    const sessionIds = (sessions ?? []).map((session) => session.id);
    const qtyByMenuId = new Map<string, number>();

    if (sessionIds.length > 0) {
      const { data: soldLines, error: soldErr } = await supabase
        .from("worksheet_sold_line")
        .select(
          `
          menu_item_id,
          quantity_sold,
          worksheet_session:session_id ( business_date, department )
        `
        )
        .in("session_id", sessionIds);

      if (soldErr) {
        setError(soldErr.message);
        setRows([]);
        setIsLoading(false);
        return;
      }

      for (const line of (soldLines ?? []) as SoldLineJoined[]) {
        const qty = Number(line.quantity_sold);
        if (qty <= 0) continue;
        qtyByMenuId.set(line.menu_item_id, (qtyByMenuId.get(line.menu_item_id) ?? 0) + qty);
      }
    }

    const totalQty = Array.from(qtyByMenuId.values()).reduce((sum, qty) => sum + qty, 0);

    setRows(
      Array.from(menuMap.values()).map((menu) => {
        const quantitySold = qtyByMenuId.get(menu.id) ?? 0;
        const revenue = quantitySold * Number(menu.price);
        return {
          id: menu.id,
          name: menu.menu_name,
          department: menu.department,
          quantitySold,
          revenue,
          sharePercent: totalQty > 0 ? (quantitySold / totalQty) * 100 : 0,
        };
      })
    );
    setIsLoading(false);
  }, [endDate, startDate, supabase]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filteredRows = useMemo(() => {
    if (departmentFilter === "all") return rows;
    return rows.filter((row) => row.department === departmentFilter);
  }, [departmentFilter, rows]);

  const fastMoving = useMemo(
    () =>
      filteredRows
        .filter((row) => row.quantitySold > 0)
        .sort((a, b) => b.quantitySold - a.quantitySold)
        .slice(0, MAX_ROWS),
    [filteredRows]
  );

  const lowMoving = useMemo(
    () =>
      [...filteredRows]
        .sort((a, b) => {
          const qtyCmp = a.quantitySold - b.quantitySold;
          if (qtyCmp !== 0) return qtyCmp;
          return a.name.localeCompare(b.name);
        })
        .slice(0, MAX_ROWS),
    [filteredRows]
  );

  const totalSold = filteredRows.reduce((sum, row) => sum + row.quantitySold, 0);
  const activeMenuCount = filteredRows.length;
  const zeroSoldCount = filteredRows.filter((row) => row.quantitySold === 0).length;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/45 p-4 sm:p-5">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <BarChart3 className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Menu Movement</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Akumulasi penjualan menu · {formatDateRange(startDate, endDate)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value as Department | "all")}
            className="min-h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-xs text-white"
          >
            <option value="all">Semua dept</option>
            <option value="bar">Bar</option>
            <option value="kitchen">Kitchen</option>
          </select>
          <span className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
            {formatQty(totalSold)} sold · {zeroSoldCount}/{activeMenuCount} low
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat movement menu...
        </div>
      ) : error ? (
        <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <MovementDonut
            title="Fast Moving Menu"
            icon={TrendingUp}
            rows={fastMoving}
            tone="fast"
            emptyLabel="Belum ada menu dengan penjualan dalam rentang tanggal ini."
          />
          <MovementDonut
            title="Low Moving Menu"
            icon={TrendingDown}
            rows={lowMoving}
            tone="low"
            emptyLabel="Belum ada menu aktif untuk ditampilkan."
          />
        </div>
      )}
    </section>
  );
}
