"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
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
import { ADMIN_ROLES } from "@/lib/auth/routeAccess";
import { getRoleLabel, isMasterAdminRole } from "@/lib/auth/permissions";
import {
  ADMIN_TAB_TASK_ID,
  getDefaultRoleTaskMap,
  isRoleTaskEnabled,
  mergeRoleTaskSettings,
  type RoleTaskSettingMap,
} from "@/lib/auth/roleTasks";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import { AbdulCompanyMark } from "@/components/brand/AbdulCompanyMark";
import { IngredientsTab } from "@/components/admin/IngredientsTab";
import { AdminWorksheetTab } from "@/components/admin/AdminWorksheetTab";
import { MenuRecipeTab } from "@/components/admin/MenuRecipeTab";
import { MonitoringDashboard, type MonitoringTabId } from "@/components/admin/MonitoringDashboard";
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

type MenuGroupId = "dashboard" | "reporting" | "inventory" | "master-stock" | "menu-recipe" | "settings";

type MenuSubItem =
  | { type: "tab"; tabId: TabId; label: string; description: string }
  | { type: "monitoring"; id: MonitoringTabId; label: string; description: string }
  | { type: "link"; href: string; label: string; description: string };

type MenuGroup = {
  id: MenuGroupId;
  label: string;
  description: string;
  icon: typeof Package;
  items: MenuSubItem[];
};

const TABS: { id: TabId; label: string; description: string; icon: typeof Package }[] = [
  { id: "monitoring", label: "Ringkasan Operasi", description: "PO, stok, complaint, sales, download", icon: LayoutDashboard },
  { id: "purchase_order", label: "Purchase Order", description: "Purchasing order, supplier, status datang", icon: ShoppingCart },
  { id: "worksheet", label: "Inventory", description: "Worksheet Bar/Kitchen, opname, remake, closing", icon: ClipboardList },
  { id: "ingredients", label: "Master Bahan & Stok", description: "Nama bahan, unit, harga, minimum stock", icon: Package },
  { id: "menu", label: "Menu & Resep", description: "Menu jual, harga, dan komposisi", icon: Shield },
  { id: "suppliers", label: "Supplier & Harga", description: "Kontak supplier dan katalog harga", icon: Truck },
  { id: "settings", label: "Pengaturan Akses", description: "Account dan checklist task role", icon: Settings2 },
];

const MENU_GROUPS: MenuGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Ringkasan operasional harian",
    icon: LayoutDashboard,
    items: [
      { type: "monitoring", id: "overview", label: "Ringkasan Dashboard", description: "Prioritas, fondasi, PO, complaint" },
      { type: "monitoring", id: "control", label: "Complaint Tamu", description: "Komplain pelanggan, catatan, bukti foto" },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    description: "Laporan harian dan export data",
    icon: ClipboardList,
    items: [
      { type: "link", href: "/dashboard/reports?tab=sales-summary", label: "Sales Summary", description: "Moka POS entry & manual revenue" },
      { type: "link", href: "/dashboard/reports?tab=gross-profit", label: "Gross Profit", description: "Daily gross margin & food cost calculation" },
      { type: "link", href: "/dashboard/reports?tab=item-sales", label: "Item Sales", description: "Menu movement quantity from Moka" },
      { type: "link", href: "/dashboard/reports?tab=service-charge", label: "Service Charge", description: "Staff gross share & net settlement" },
      { type: "link", href: "/dashboard/reports?tab=overtime-staff", label: "Overtime Staff", description: "Daily staff overtime & DW tracking" },
      { type: "link", href: "/dashboard/reports?tab=complaint-case", label: "Complaint & Case", description: "Real-time daily guest feedback & issues" },
      { type: "monitoring", id: "export", label: "Download Laporan", description: "XLSX stok, sales, demand, complaint" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "PO, worksheet, stok, dan ledger",
    icon: ShoppingCart,
    items: [
      { type: "tab", tabId: "purchase_order", label: "Purchase Order", description: "Purchasing order, supplier, status datang" },
      { type: "tab", tabId: "worksheet", label: "Inventory Worksheet", description: "Worksheet Bar/Kitchen, opname, remake, closing" },
      { type: "monitoring", id: "demand", label: "Rencana PO", description: "Demand, event, draft order supplier" },
      { type: "monitoring", id: "inventory", label: "Stok & Ledger", description: "Live stock, receive audit, ledger" },
    ],
  },
  {
    id: "master-stock",
    label: "Master Bahan & Stock",
    description: "Bahan, stok minimum, supplier, harga",
    icon: Package,
    items: [
      { type: "tab", tabId: "ingredients", label: "Master Bahan & Stok", description: "Nama bahan, unit, harga, minimum stock" },
      { type: "tab", tabId: "suppliers", label: "Supplier & Harga", description: "Kontak supplier dan katalog harga" },
    ],
  },
  {
    id: "menu-recipe",
    label: "Menu & Resep",
    description: "Menu jual, resep, dan penjualan menu",
    icon: Shield,
    items: [
      { type: "tab", tabId: "menu", label: "Menu & Resep", description: "Menu jual, harga, dan komposisi" },
      { type: "monitoring", id: "sales", label: "Penjualan Menu", description: "Menu movement dan revenue" },
    ],
  },
  {
    id: "settings",
    label: "Pengaturan",
    description: "Akses akun dan checklist role",
    icon: Settings2,
    items: [
      { type: "tab", tabId: "settings", label: "Pengaturan Akses", description: "Account dan checklist task role" },
    ],
  },
];

const DEFAULT_HOME_TAB_ID: TabId = "purchase_order";
const DEFAULT_MENU_GROUP_ID: MenuGroupId = "inventory";

function getPreferredHomeTab(tabs: { id: TabId }[]): TabId {
  return tabs.find((tab) => tab.id === DEFAULT_HOME_TAB_ID)?.id ?? tabs.find((tab) => tab.id !== "monitoring")?.id ?? tabs[0]?.id ?? "monitoring";
}

export default function MasterDataView() {
  return (
    <ProtectedRoute allowedRoles={ADMIN_ROLES}>
      <MasterDataContent />
    </ProtectedRoute>
  );
}

function MasterDataContent() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const session = getStaffSession();
  const sessionRole = session?.role ?? null;
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_HOME_TAB_ID);
  const [activeMonitoringTab, setActiveMonitoringTab] = useState<MonitoringTabId>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openAccordionGroup, setOpenAccordionGroup] = useState<MenuGroupId | null>(DEFAULT_MENU_GROUP_ID);
  const [roleTasks, setRoleTasks] = useState<RoleTaskSettingMap>(() =>
    session ? getDefaultRoleTaskMap(session.role) : {}
  );

  const loadRoleTasks = useCallback(async () => {
    if (!sessionRole) return;
    const defaults = getDefaultRoleTaskMap(sessionRole);
    if (!supabase) {
      setRoleTasks(defaults);
      return;
    }

    const { data, error } = await supabase
      .from("role_task_setting")
      .select("task_id, is_enabled")
      .eq("role", sessionRole);

    if (error) {
      setRoleTasks(defaults);
      return;
    }

    setRoleTasks(mergeRoleTaskSettings(sessionRole, data ?? []));
  }, [sessionRole, supabase]);

  useEffect(() => {
    void loadRoleTasks();
  }, [loadRoleTasks]);

  const safeVisibleTabs = useMemo(() => {
    if (!sessionRole) return [TABS[0]];
    const visibleTabs = TABS.filter((tab) => {
      const taskId = ADMIN_TAB_TASK_ID[tab.id];
      if (isMasterAdminRole(sessionRole)) return true;
      if (tab.id === "settings") return false;
      return isRoleTaskEnabled(roleTasks, sessionRole, taskId);
    });
    return visibleTabs.length > 0 ? visibleTabs : [TABS[0]];
  }, [roleTasks, sessionRole]);

  const safeMenuGroups = useMemo(() => {
    const visibleTabIds = new Set(safeVisibleTabs.map((tab) => tab.id));
    return MENU_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.type === "tab") return visibleTabIds.has(item.tabId);
        if (item.type === "monitoring") return visibleTabIds.has("monitoring");
        return visibleTabIds.has("monitoring");
      }),
    })).filter((group) => group.items.length > 0);
  }, [safeVisibleTabs]);

  useEffect(() => {
    if (!safeVisibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(getPreferredHomeTab(safeVisibleTabs));
    }
  }, [activeTab, safeVisibleTabs]);

  useEffect(() => {
    if (!safeMenuGroups.some((group) => group.id === openAccordionGroup)) {
      setOpenAccordionGroup(safeMenuGroups[0]?.id ?? null);
    }
  }, [openAccordionGroup, safeMenuGroups]);

  if (!session) return null;

  const roleLabel = getRoleLabel(session.role);
  const activeTabMeta = safeVisibleTabs.find((tab) => tab.id === activeTab) ?? safeVisibleTabs[0];

  const isGroupActive = (group: MenuGroup) =>
    group.items.some((item) => {
      if (item.type === "tab") return item.tabId === activeTab;
      if (item.type === "monitoring") return activeTab === "monitoring" && activeMonitoringTab === item.id;
      return false;
    });
  const activeMenuGroupId = safeMenuGroups.find((group) => isGroupActive(group))?.id ?? safeMenuGroups[0]?.id ?? DEFAULT_MENU_GROUP_ID;

  const renderAccordionNavItems = ({ onNavigate }: { onNavigate?: () => void } = {}) => (
    safeMenuGroups.map((group) => {
      const Icon = group.icon;
      const active = isGroupActive(group);
      const open = openAccordionGroup === group.id;

      return (
        <div key={group.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setOpenAccordionGroup(open ? null : group.id)}
            aria-expanded={open}
            className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
              active ? "bg-teal-50 text-teal-700" : "bg-white text-slate-900 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{group.label}</span>
              <span className={`mt-0.5 block truncate text-xs ${active ? "text-teal-700" : "text-slate-600"}`}>
                {group.description}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-900 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open ? (
            <div className="space-y-1 border-t border-slate-200 bg-slate-50/50 px-4 py-3">
              {group.items.map((item) => {
                if (item.type === "link") {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="group flex flex-col rounded-lg bg-white p-3 text-left transition-all hover:bg-teal-50"
                    >
                      <span className="text-sm font-semibold text-slate-900 group-hover:text-teal-700">{item.label}</span>
                      <span className="mt-0.5 text-xs font-medium text-slate-600 group-hover:text-teal-700">
                        {item.description}
                      </span>
                    </Link>
                  );
                }

                const itemActive =
                  item.type === "tab"
                    ? activeTab === item.tabId
                    : activeTab === "monitoring" && activeMonitoringTab === item.id;

                return (
                  <button
                    key={item.type === "tab" ? item.tabId : item.id}
                    type="button"
                    onClick={() => {
                      if (item.type === "tab") {
                        setActiveTab(item.tabId);
                      } else {
                        setActiveTab("monitoring");
                        setActiveMonitoringTab(item.id);
                      }
                      setOpenAccordionGroup(group.id);
                      onNavigate?.();
                    }}
                    className={`flex w-full flex-col rounded-lg p-3 text-left transition-all hover:bg-teal-50 ${
                      itemActive ? "bg-teal-50" : "bg-white"
                    }`}
                    aria-current={itemActive ? "page" : undefined}
                  >
                    <span className={`text-sm font-semibold ${itemActive ? "text-teal-700" : "text-slate-900"}`}>
                      {item.label}
                    </span>
                    <span className={`mt-0.5 text-xs font-medium ${itemActive ? "text-teal-700" : "text-slate-600"}`}>
                      {item.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    })
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-30 bg-transparent px-4 py-3">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => {
                setOpenAccordionGroup(activeMenuGroupId);
                setMobileMenuOpen(true);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition hover:bg-slate-50 active:scale-[0.98]"
              aria-label="Buka menu workspace"
              aria-expanded={mobileMenuOpen}
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Tutup menu workspace"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
            />
            <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(90vw,380px)] flex-col border-r border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
                <AbdulCompanyMark size="sm" subtitle="Artha System" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50 active:scale-[0.98]"
                  aria-label="Tutup menu workspace"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="border-b border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Workspace</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{activeTabMeta.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{session.name} · {roleLabel}</p>
              </div>
              <nav className="flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin" aria-label="Admin workspace">
                {renderAccordionNavItems({ onNavigate: () => setMobileMenuOpen(false) })}
              </nav>
              <div className="border-t border-slate-200 p-4">
                <LogoutButton className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 active:scale-[0.98]">
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  Log Out
                </LogoutButton>
              </div>
            </aside>
          </div>
        ) : null}

        <main className="mx-auto min-h-screen w-full max-w-[1600px] p-4 md:p-6 lg:p-8">
          <section className="min-w-0 pb-8">
            {activeTab === "ingredients" && <IngredientsTab />}
            {activeTab === "menu" && <MenuRecipeTab />}
            {activeTab === "suppliers" && <SuppliersTab />}
            {activeTab === "purchase_order" && <PurchaseRequestTracker />}
            {activeTab === "worksheet" && <AdminWorksheetTab />}
            {activeTab === "monitoring" && <MonitoringDashboard activeTab={activeMonitoringTab} showNavigation={false} />}
            {activeTab === "settings" && <WorksheetStaffSettingsTab />}
          </section>
        </main>
    </div>
  );
}
