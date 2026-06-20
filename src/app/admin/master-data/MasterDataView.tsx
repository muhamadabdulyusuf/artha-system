"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Package,
  Settings2,
  Shield,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ADMIN_ROLES } from "@/lib/auth/routeAccess";
import { isViewerRole } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { AbdulCompanyMark } from "@/components/brand/AbdulCompanyMark";
import { IngredientsTab } from "@/components/admin/IngredientsTab";
import { AdminWorksheetTab } from "@/components/admin/AdminWorksheetTab";
import { MenuRecipeTab } from "@/components/admin/MenuRecipeTab";
import { MonitoringDashboard } from "@/components/admin/MonitoringDashboard";
import { PurchaseRequestTracker } from "@/components/admin/PurchaseRequestTracker";
import { SuppliersTab } from "@/components/admin/SuppliersTab";
import { WorksheetStaffSettingsTab } from "@/components/admin/WorksheetStaffSettingsTab";

type TabId =
  | "ingredients"
  | "menu"
  | "suppliers"
  | "purchase_order"
  | "worksheet"
  | "monitoring"
  | "settings";

const TABS: { id: TabId; label: string; description: string; icon: typeof Package }[] = [
  { id: "monitoring", label: "Ringkasan Operasi", description: "PO, stok, complaint, sales, download", icon: LayoutDashboard },
  { id: "purchase_order", label: "Purchase Order", description: "Purchasing order, supplier, status datang", icon: ShoppingCart },
  { id: "worksheet", label: "Worksheet Bar & Kitchen", description: "Closing harian Bar dan Kitchen", icon: ClipboardList },
  { id: "ingredients", label: "Master Bahan & Stok", description: "Nama bahan, unit, harga, minimum stock", icon: Package },
  { id: "menu", label: "Menu & Resep", description: "Menu jual, harga, dan komposisi", icon: Shield },
  { id: "suppliers", label: "Supplier & Harga", description: "Kontak supplier dan katalog harga", icon: Truck },
  { id: "settings", label: "Pengaturan Akses", description: "Tampilan worksheet untuk staff", icon: Settings2 },
];

export default function MasterDataView() {
  return (
    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
      <MasterDataContent />
    </ProtectedRoute>
  );
}

function MasterDataContent() {
  const session = getStaffSession();
  const [activeTab, setActiveTab] = useState<TabId>("monitoring");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (session && isViewerRole(session.role)) {
      setActiveTab("monitoring");
    }
  }, [session]);

  if (!session) return null;
  const visibleTabs = isViewerRole(session.role)
    ? TABS.filter((tab) => tab.id === "monitoring")
    : TABS;

  const roleLabel =
    session.role === "admin"
      ? "Administrator"
      : session.role === "viewer"
        ? "Viewer (Read-Only)"
        : "Operational Manager";
  const activeTabMeta = visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0];
  const ActiveIcon = activeTabMeta.icon;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <AbdulCompanyMark subtitle="Artha System" />
          <div className="hidden min-w-0 flex-1 border-l border-zinc-800 pl-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Command Center
            </p>
            <h1 className="mt-1 text-xl font-bold text-white">Artha Operations Dashboard</h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              {session.name} · {roleLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-right sm:block">
              <p className="text-xs font-semibold text-zinc-100">{session.name}</p>
              <p className="text-[11px] text-zinc-500">{roleLabel}</p>
            </div>
            <ThemeToggle />
            <LogoutButton className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 hover:border-red-500/50 hover:text-red-300">
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              Log Out
            </LogoutButton>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="sticky top-0 z-30 mb-5 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/95 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400 text-zinc-950">
              <ActiveIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-100">{activeTabMeta.label}</p>
              <p className="text-xs text-zinc-500">{session.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            <MenuIcon className="h-4 w-4" />
            Menu
          </button>
        </div>

        {menuOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <aside className="relative flex h-full w-[min(86vw,340px)] flex-col border-r border-zinc-800 bg-zinc-950 p-4 shadow-2xl shadow-black">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-100">Menu</p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300"
                  aria-label="Tutup menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMenuOpen(false);
                      }}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${
                        active
                          ? "bg-cyan-400 text-zinc-950"
                          : "border border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate">{tab.label}</span>
                        <span className={`block truncate text-[11px] ${active ? "text-zinc-800" : "text-zinc-500"}`}>
                          {tab.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <aside className="sticky top-5 hidden rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-lg shadow-black/20 backdrop-blur lg:block">
            <div className="mb-3 border-b border-zinc-800 px-2 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Workspace</p>
              <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{activeTabMeta.label}</p>
            </div>
            <nav className="space-y-2" aria-label="Admin workspace">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm font-semibold transition ${
                      active
                        ? "border-cyan-300 bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-950/30"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate">{tab.label}</span>
                      <span className={`block truncate text-[11px] ${active ? "text-zinc-800" : "text-zinc-500"}`}>
                        {tab.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 pb-8">
            {activeTab === "ingredients" && <IngredientsTab />}
            {activeTab === "menu" && <MenuRecipeTab />}
            {activeTab === "suppliers" && <SuppliersTab />}
            {activeTab === "purchase_order" && <PurchaseRequestTracker />}
            {activeTab === "worksheet" && <AdminWorksheetTab />}
            {activeTab === "monitoring" && <MonitoringDashboard />}
            {activeTab === "settings" && <WorksheetStaffSettingsTab />}
          </section>
        </div>
      </div>
    </div>
  );
}
