import type { StaffRole } from "@/lib/types/database";

export type RoleTaskId =
  | "dashboard"
  | "purchase_order"
  | "admin_worksheet"
  | "master_ingredients"
  | "menu_recipe"
  | "suppliers"
  | "role_settings"
  | "worksheet_receive"
  | "worksheet_outstock"
  | "worksheet_opname"
  | "worksheet_premix"
  | "worksheet_issue"
  | "worksheet_sold";

export type RoleTaskDefinition = {
  id: RoleTaskId;
  label: string;
  description: string;
  group: "Dashboard" | "Purchasing" | "Master Data" | "Inventory" | "System";
  roles: StaffRole[];
  defaultEnabled: Partial<Record<StaffRole, boolean>>;
  lockedFor?: StaffRole[];
};

export type RoleTaskSettingMap = Partial<Record<RoleTaskId, boolean>>;

export const ROLE_TASKS: RoleTaskDefinition[] = [
  {
    id: "dashboard",
    label: "Dashboard Operasional",
    description: "Lihat ringkasan PO, stok kritis, sales, complaint, dan status harian.",
    group: "Dashboard",
    roles: ["master_admin", "admin", "op_manager", "viewer"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, viewer: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "purchase_order",
    label: "Purchase Order",
    description: "Buat dan pantau PO, import template, supplier, harga, qty, satuan, dan ETA.",
    group: "Purchasing",
    roles: ["master_admin", "admin", "op_manager", "viewer"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, viewer: false },
    lockedFor: ["master_admin"],
  },
  {
    id: "admin_worksheet",
    label: "Inventory Bar & Kitchen",
    description: "Buka worksheet inventory Bar dan Kitchen untuk closing, validasi stok, dan audit.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "viewer"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, viewer: false },
    lockedFor: ["master_admin"],
  },
  {
    id: "master_ingredients",
    label: "Master Bahan & Stok",
    description: "Kelola nama bahan, unit, harga dasar, supplier utama, minimum stock, dan status aktif.",
    group: "Master Data",
    roles: ["master_admin", "admin", "op_manager", "viewer"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, viewer: false },
    lockedFor: ["master_admin"],
  },
  {
    id: "menu_recipe",
    label: "Menu & Recipe",
    description: "Kelola menu jual, harga menu, versi recipe, dan komposisi bahan.",
    group: "Master Data",
    roles: ["master_admin", "admin", "op_manager", "viewer"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, viewer: false },
    lockedFor: ["master_admin"],
  },
  {
    id: "suppliers",
    label: "Supplier & Katalog Harga",
    description: "Kelola supplier, kontak, link pembelian, dan katalog harga bahan.",
    group: "Master Data",
    roles: ["master_admin", "admin", "op_manager", "viewer"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, viewer: false },
    lockedFor: ["master_admin"],
  },
  {
    id: "role_settings",
    label: "Account & Access Control",
    description: "Kelola akun staff dan batas akses setiap role.",
    group: "System",
    roles: ["master_admin"],
    defaultEnabled: { master_admin: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "worksheet_receive",
    label: "Receive Barang",
    description: "Input barang masuk dari supplier lengkap dengan qty, satuan, harga, dan bukti.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "bar_staff", "kitchen_staff"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, bar_staff: true, kitchen_staff: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "worksheet_outstock",
    label: "Out Stock & Waste",
    description: "Catat barang keluar, rusak, basi, waste, atau pemakaian non-penjualan.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "bar_staff", "kitchen_staff"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, bar_staff: true, kitchen_staff: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "worksheet_opname",
    label: "Stock Opname",
    description: "Input stok fisik, lihat variance, dan ajukan koreksi stok.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "bar_staff", "kitchen_staff"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, bar_staff: true, kitchen_staff: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "worksheet_premix",
    label: "Premix / WIP",
    description: "Catat produksi premix atau WIP yang memakai recipe dan mempengaruhi stok.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "bar_staff", "kitchen_staff"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, bar_staff: true, kitchen_staff: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "worksheet_issue",
    label: "Complaint & Remake",
    description: "Catat complaint, remake, evidence kualitas, dan dampaknya ke bahan.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "bar_staff", "kitchen_staff"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, bar_staff: true, kitchen_staff: true },
    lockedFor: ["master_admin"],
  },
  {
    id: "worksheet_sold",
    label: "Manual Menu Sales",
    description: "Input penjualan menu manual untuk kebutuhan rekonsiliasi stok dan sales.",
    group: "Inventory",
    roles: ["master_admin", "admin", "op_manager", "bar_staff", "kitchen_staff"],
    defaultEnabled: { master_admin: true, admin: true, op_manager: true, bar_staff: true, kitchen_staff: true },
    lockedFor: ["master_admin"],
  },
];

export const ADMIN_TAB_TASK_ID = {
  monitoring: "dashboard",
  purchase_order: "purchase_order",
  worksheet: "admin_worksheet",
  ingredients: "master_ingredients",
  menu: "menu_recipe",
  suppliers: "suppliers",
  settings: "role_settings",
} as const satisfies Record<string, RoleTaskId>;

export const WORKSHEET_TAB_TASK_ID = {
  receive: "worksheet_receive",
  outstock: "worksheet_outstock",
  opname: "worksheet_opname",
  premix: "worksheet_premix",
  issue: "worksheet_issue",
  sold: "worksheet_sold",
} as const satisfies Record<string, RoleTaskId>;

export function getRoleTaskDefinitions(role: StaffRole): RoleTaskDefinition[] {
  return ROLE_TASKS.filter((task) => task.roles.includes(role));
}

export function getDefaultRoleTaskMap(role: StaffRole): RoleTaskSettingMap {
  return Object.fromEntries(
    getRoleTaskDefinitions(role).map((task) => [task.id, Boolean(task.defaultEnabled[role])])
  ) as RoleTaskSettingMap;
}

export function mergeRoleTaskSettings(
  role: StaffRole,
  rows: { task_id: string; is_enabled: boolean }[]
): RoleTaskSettingMap {
  const defaults = getDefaultRoleTaskMap(role);
  const validIds = new Set(getRoleTaskDefinitions(role).map((task) => task.id));

  for (const row of rows) {
    if (!validIds.has(row.task_id as RoleTaskId)) continue;
    defaults[row.task_id as RoleTaskId] = Boolean(row.is_enabled);
  }

  for (const task of getRoleTaskDefinitions(role)) {
    if (task.lockedFor?.includes(role)) defaults[task.id] = true;
  }

  return defaults;
}

export function isRoleTaskEnabled(
  settings: RoleTaskSettingMap,
  role: StaffRole,
  taskId: RoleTaskId
): boolean {
  const task = ROLE_TASKS.find((item) => item.id === taskId);
  if (!task || !task.roles.includes(role)) return false;
  if (task.lockedFor?.includes(role)) return true;
  return settings[taskId] ?? Boolean(task.defaultEnabled[role]);
}
