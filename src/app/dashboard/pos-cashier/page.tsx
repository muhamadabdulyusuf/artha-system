"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, Clock3, Loader2, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { IngredientRow, MenuItemRow, MenuRecipeVersionRow, RecipeLineRow, StaffRole } from "@/lib/types/database";
import { CartPanel } from "./components/CartPanel";
import { PaymentModal } from "./components/PaymentModal";
import { ProductGrid } from "./components/ProductGrid";
import type { CartItem, CashierShift, CompletedTransaction, FinanceSummary, PaymentMethod, ProductMenu } from "./types";

type MenuRow = Pick<MenuItemRow, "id" | "menu_name" | "department" | "price" | "is_active">;
type RecipeVersionLite = Pick<MenuRecipeVersionRow, "id" | "menu_item_id">;
type RecipeLineStockJoin = Pick<RecipeLineRow, "recipe_version_id" | "quantity_per_serving"> & {
  ingredient: Pick<IngredientRow, "current_stock"> | Pick<IngredientRow, "current_stock">[] | null;
};

const POS_ROLES: StaffRole[] = ["master_admin", "admin", "op_manager"];
const SHIFT_STORAGE_KEY = "artha_pos_cashier_shift";
const TRANSACTION_STORAGE_KEY = "artha_pos_cashier_transactions";

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function parseCurrencyInput(value: string): number {
  const normalized = value.replace(/[^\d]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function buildFinanceSummary(items: CartItem[], servicePercent: number, taxPercent: number): FinanceSummary {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceAmount = subtotal * (servicePercent / 100);
  const subtotalAfterService = subtotal + serviceAmount;
  const taxAmount = subtotalAfterService * (taxPercent / 100);
  return {
    subtotal,
    servicePercent,
    serviceAmount,
    subtotalAfterService,
    taxPercent,
    taxAmount,
    grandTotal: subtotalAfterService + taxAmount,
  };
}

function loadStoredShift(): CashierShift | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SHIFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CashierShift;
    return parsed.status === "OPEN" ? parsed : null;
  } catch {
    return null;
  }
}

function loadStoredTransactions(): CompletedTransaction[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TRANSACTION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CompletedTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredShift(shift: CashierShift | null): void {
  if (typeof window === "undefined") return;
  if (!shift) {
    window.localStorage.removeItem(SHIFT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(shift));
}

function saveStoredTransactions(transactions: CompletedTransaction[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRANSACTION_STORAGE_KEY, JSON.stringify(transactions));
}

function computeMenuPortions(menuRows: MenuRow[], recipeVersions: RecipeVersionLite[], recipeLines: RecipeLineStockJoin[]): ProductMenu[] {
  const activeVersionByMenu = new Map(recipeVersions.map((version) => [version.menu_item_id, version.id]));
  const linesByVersion = new Map<string, RecipeLineStockJoin[]>();

  for (const line of recipeLines) {
    linesByVersion.set(line.recipe_version_id, [...(linesByVersion.get(line.recipe_version_id) ?? []), line]);
  }

  return menuRows.map((menu) => {
    const versionId = activeVersionByMenu.get(menu.id);
    const lines = versionId ? linesByVersion.get(versionId) ?? [] : [];
    const possiblePortions = lines
      .map((line) => {
        const ingredient = resolveOne(line.ingredient);
        const qtyPerServing = Number(line.quantity_per_serving ?? 0);
        if (!ingredient || qtyPerServing <= 0) return Number.POSITIVE_INFINITY;
        return Math.floor(Number(ingredient.current_stock ?? 0) / qtyPerServing);
      })
      .filter((value) => Number.isFinite(value));

    const currentStock = possiblePortions.length > 0 ? Math.max(0, Math.min(...possiblePortions)) : 999;

    return {
      id: menu.id,
      name: menu.menu_name,
      price: Number(menu.price ?? 0),
      category: menu.department,
      currentStock,
      isAvailable: Boolean(menu.is_active) && currentStock > 0,
    };
  });
}

function ShiftGate({
  session,
  openingCashInput,
  isOpening,
  onChangeOpeningCash,
  onOpenShift,
}: {
  session: StaffSession | null;
  openingCashInput: string;
  isOpening: boolean;
  onChangeOpeningCash: (value: string) => void;
  onOpenShift: () => void;
}) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] items-center justify-center bg-slate-50 p-4 md:p-6 lg:p-8">
        <section className="w-full max-w-lg rounded-xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
              <LockKeyhole className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Shift Lock</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Buka Shift Kasir</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Masukkan uang modal awal sebelum transaksi POS dibuka. Operator: {session?.name ?? "-"}.
              </p>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Uang Modal Awal</span>
            <input
              inputMode="numeric"
              value={openingCashInput}
              onChange={(event) => onChangeOpeningCash(event.target.value)}
              placeholder="Contoh: 500000"
              className="min-h-12 w-full rounded-md border border-slate-200/80 bg-slate-50 px-3 text-lg font-semibold tabular-nums text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <button
            type="button"
            onClick={onOpenShift}
            disabled={isOpening}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-teal-700 active:scale-[0.98] disabled:bg-slate-300"
          >
            {isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Open Shift
          </button>
        </section>
      </div>
    </main>
  );
}

function PosCashierContent() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [shift, setShift] = useState<CashierShift | null>(null);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [actualCashInput, setActualCashInput] = useState("");
  const [closingOpen, setClosingOpen] = useState(false);
  const [products, setProducts] = useState<ProductMenu[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [transactions, setTransactions] = useState<CompletedTransaction[]>([]);
  const [servicePercent, setServicePercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; message: string } | null>(null);

  const finance = useMemo(() => buildFinanceSummary(cartItems, servicePercent, taxPercent), [cartItems, servicePercent, taxPercent]);
  const shiftRevenue = useMemo(() => transactions.reduce((sum, trx) => sum + trx.totalAmount, 0), [transactions]);

  const loadProductsAndSettings = useCallback(async () => {
    if (!supabase) {
      setNotice({ variant: "error", message: "Supabase belum dikonfigurasi." });
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    setNotice(null);

    const [menuResult, settingResult] = await Promise.all([
      supabase
        .from("menu_item")
        .select("id, menu_name, department, price, is_active")
        .eq("is_active", true)
        .order("department", { ascending: true })
        .order("menu_name", { ascending: true }),
      supabase.from("service_charge_setting").select("service_percent, tax_percent").eq("id", "default").maybeSingle(),
    ]);

    const firstError = menuResult.error ?? settingResult.error;
    if (firstError) {
      setNotice({ variant: "error", message: `Gagal memuat POS: ${firstError.message}` });
      setLoadingProducts(false);
      return;
    }

    const menus = (menuResult.data ?? []) as MenuRow[];
    const menuIds = menus.map((menu) => menu.id);
    let recipeVersions: RecipeVersionLite[] = [];
    let recipeLines: RecipeLineStockJoin[] = [];

    if (menuIds.length > 0) {
      const { data: versionData, error: versionError } = await supabase
        .from("menu_recipe_version")
        .select("id, menu_item_id")
        .in("menu_item_id", menuIds)
        .eq("is_active", true);

      if (versionError) {
        setNotice({ variant: "error", message: `Gagal memuat recipe menu: ${versionError.message}` });
        setLoadingProducts(false);
        return;
      }

      recipeVersions = (versionData ?? []) as RecipeVersionLite[];
      const versionIds = recipeVersions.map((version) => version.id);

      if (versionIds.length > 0) {
        const { data: lineData, error: lineError } = await supabase
          .from("recipe_line")
          .select("recipe_version_id, quantity_per_serving, ingredient:ingredient_id ( current_stock )")
          .in("recipe_version_id", versionIds);

        if (lineError) {
          setNotice({ variant: "error", message: `Gagal memuat stok recipe: ${lineError.message}` });
          setLoadingProducts(false);
          return;
        }

        recipeLines = (lineData ?? []) as RecipeLineStockJoin[];
      }
    }

    setServicePercent(Number(settingResult.data?.service_percent ?? 0));
    setTaxPercent(Number(settingResult.data?.tax_percent ?? 0));
    setProducts(computeMenuPortions(menus, recipeVersions, recipeLines));
    setLoadingProducts(false);
  }, [supabase]);

  useEffect(() => {
    setSession(getStaffSession());
    setShift(loadStoredShift());
    setTransactions(loadStoredTransactions());
    void loadProductsAndSettings();
  }, [loadProductsAndSettings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F4") {
        event.preventDefault();
        if (cartItems.length > 0 && shift?.status === "OPEN") setPaymentOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartItems.length, shift?.status]);

  const openShift = () => {
    if (!session) return;
    const initialCash = parseCurrencyInput(openingCashInput);
    setIsOpening(true);
    const nextShift: CashierShift = {
      id: `shift-${Date.now()}`,
      openedBy: session.name,
      openTime: new Date().toISOString(),
      closeTime: null,
      initialCash,
      actualCash: null,
      status: "OPEN",
    };
    setShift(nextShift);
    setTransactions([]);
    saveStoredShift(nextShift);
    saveStoredTransactions([]);
    setOpeningCashInput("");
    setIsOpening(false);
  };

  const addProductToCart = (product: ProductMenu) => {
    if (!product.isAvailable || product.currentStock <= 0) return;
    setCartItems((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) return current;
        return current.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { id: product.id, name: product.name, price: product.price, quantity: 1, customNotes: "" }];
    });
  };

  const incrementItem = (id: string) => {
    const product = products.find((item) => item.id === id);
    setCartItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const maxQty = product?.currentStock ?? item.quantity + 1;
        return { ...item, quantity: Math.min(item.quantity + 1, maxQty) };
      })
    );
  };

  const decrementItem = (id: string) => {
    setCartItems((current) =>
      current
        .map((item) => (item.id === id ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const updateNotes = (id: string, customNotes: string) => {
    setCartItems((current) => current.map((item) => (item.id === id ? { ...item, customNotes } : item)));
  };

  const completePayment = async (payment: { method: PaymentMethod; paidAmount: number; changeAmount: number }) => {
    if (!shift) return;
    setIsProcessingPayment(true);
    const transaction: CompletedTransaction = {
      id: `trx-${Date.now()}`,
      shiftId: shift.id,
      paymentMethod: payment.method,
      paidAmount: payment.paidAmount,
      changeAmount: payment.changeAmount,
      totalAmount: finance.grandTotal,
      createdAt: new Date().toISOString(),
    };
    const nextTransactions = [...transactions, transaction];
    setTransactions(nextTransactions);
    saveStoredTransactions(nextTransactions);
    setCartItems([]);
    setPaymentOpen(false);
    setNotice({ variant: "success", message: `Transaksi ${formatRupiah(finance.grandTotal)} berhasil diproses.` });
    await loadProductsAndSettings();
    setIsProcessingPayment(false);
  };

  const closeShift = () => {
    if (!shift) return;
    const actualCash = parseCurrencyInput(actualCashInput);
    const closedShift: CashierShift = {
      ...shift,
      closeTime: new Date().toISOString(),
      actualCash,
      status: "CLOSED",
    };
    saveStoredShift(closedShift);
    saveStoredTransactions([]);
    setShift(null);
    setTransactions([]);
    setCartItems([]);
    setActualCashInput("");
    setClosingOpen(false);
    setNotice({ variant: "success", message: "Shift kasir berhasil ditutup." });
  };

  if (!shift) {
    return (
      <ShiftGate
        session={session}
        openingCashInput={openingCashInput}
        isOpening={isOpening}
        onChangeOpeningCash={setOpeningCashInput}
        onOpenShift={openShift}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-[1600px] space-y-6 bg-slate-50 p-4 md:p-6 lg:p-8">
        <header className="flex flex-col gap-6 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Banknote className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link
                  href="/admin/master-data"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Admin
                </Link>
                <span className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                  Shift OPEN
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Artha POS Cashier</h1>
              <p className="mt-1 text-sm text-slate-600">
                Kasir: {shift.openedBy} · Modal awal {formatRupiah(shift.initialCash)}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[560px]">
            <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-600">Transaksi</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{transactions.length.toLocaleString("id-ID")}</p>
            </div>
            <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-600">Revenue Shift</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatRupiah(shiftRevenue)}</p>
            </div>
            <button
              type="button"
              onClick={() => setClosingOpen(true)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-900 transition-all duration-200 hover:bg-amber-100 active:scale-[0.98]"
            >
              <LogOut className="h-4 w-4" />
              Closing Shift Settlement
            </button>
          </div>
        </header>

        {notice ? (
          <p
            className={`rounded-xl border px-4 py-3 text-sm shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] ${
              notice.variant === "success"
                ? "border-teal-100 bg-teal-50 text-teal-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <ProductGrid products={products} loading={loadingProducts} onSelectProduct={addProductToCart} />
          </div>
          <div className="min-w-0 lg:col-span-4">
            <CartPanel
              items={cartItems}
              products={products}
              finance={finance}
              onIncrement={incrementItem}
              onDecrement={decrementItem}
              onRemove={(id) => setCartItems((current) => current.filter((item) => item.id !== id))}
              onUpdateNotes={updateNotes}
              onProcessPayment={() => setPaymentOpen(true)}
            />
          </div>
        </div>
      </div>

      <PaymentModal
        open={paymentOpen}
        grandTotal={finance.grandTotal}
        isProcessing={isProcessingPayment}
        onClose={() => setPaymentOpen(false)}
        onConfirm={completePayment}
      />

      {closingOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                <Clock3 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Settlement</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Closing Shift Settlement</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Kunci shift harian setelah uang fisik kasir sudah dihitung.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-lg border border-slate-200/80 bg-slate-50 p-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-slate-600">Modal awal</span>
                <span className="font-semibold text-slate-950">{formatRupiah(shift.initialCash)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-slate-600">Revenue shift</span>
                <span className="font-semibold text-slate-950">{formatRupiah(shiftRevenue)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-slate-600">Expected cash baseline</span>
                <span className="font-semibold text-slate-950">{formatRupiah(shift.initialCash + shiftRevenue)}</span>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Actual Cash di Drawer</span>
              <input
                inputMode="numeric"
                value={actualCashInput}
                onChange={(event) => setActualCashInput(event.target.value)}
                placeholder="Contoh: 1200000"
                className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
              />
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setClosingOpen(false)}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200/80 bg-white px-4 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={closeShift}
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-amber-600 px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-amber-700 active:scale-[0.98]"
              >
                Close Shift
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function PosCashierPage() {
  return (
    <ProtectedRoute allowedRoles={POS_ROLES}>
      <PosCashierContent />
    </ProtectedRoute>
  );
}
