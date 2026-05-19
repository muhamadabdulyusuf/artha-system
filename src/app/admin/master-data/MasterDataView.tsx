"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, LogOut, Package, Shield, Truck } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ADMIN_ROLES } from "@/lib/auth/routeAccess";
import { isViewerRole } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { IngredientsTab } from "@/components/admin/IngredientsTab";
import { MenuRecipeTab } from "@/components/admin/MenuRecipeTab";
import { MonitoringDashboard } from "@/components/admin/MonitoringDashboard";
import { SuppliersTab } from "@/components/admin/SuppliersTab";

type TabId = "ingredients" | "menu" | "suppliers" | "monitoring";

const TABS: { id: TabId; label: string; icon: typeof Package }[] = [
  { id: "ingredients", label: "Ingredients", icon: Package },
  { id: "menu", label: "Menu & Resep", icon: LayoutDashboard },
  { id: "suppliers", label: "Supplier", icon: Truck },
  { id: "monitoring", label: "Monitoring", icon: Shield },
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
  const [activeTab, setActiveTab] = useState<TabId>("ingredients");

  useEffect(() => {
    if (session && isViewerRole(session.role)) {
      setActiveTab("monitoring");
    }
  }, [session]);

  if (!session) return null;

  const roleLabel =
    session.role === "admin"
      ? "Administrator"
      : session.role === "viewer"
        ? "Viewer (Read-Only)"
        : "Operational Manager";

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/20 ring-1 ring-indigo-500/50">
              <Shield className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Abdul Company · Command Center
              </p>
              <h1 className="text-lg font-bold text-white">Admin Master Data</h1>
              <p className="text-xs text-zinc-500">
                {session.name} · {roleLabel}
              </p>
            </div>
          </div>
          <LogoutButton className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-200 hover:border-red-500/50 hover:text-red-300">
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            Log Out
          </LogoutButton>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <nav
          className="mb-6 flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-1.5"
          aria-label="Tab admin"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition sm:flex-none sm:px-5 ${
                  active
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">
                  {tab.id === "ingredients"
                    ? "Bahan"
                    : tab.id === "menu"
                      ? "Menu"
                      : tab.id === "suppliers"
                        ? "Supplier"
                        : "Monitor"}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
          {activeTab === "ingredients" && <IngredientsTab />}
          {activeTab === "menu" && <MenuRecipeTab />}
          {activeTab === "suppliers" && <SuppliersTab />}
          {activeTab === "monitoring" && <MonitoringDashboard />}
        </section>
      </div>
    </div>
  );
}
