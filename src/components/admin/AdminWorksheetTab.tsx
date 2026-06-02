"use client";

import { useState } from "react";
import { Building2, ClipboardList, ShoppingCart } from "lucide-react";
import { PurchaseRequestTracker } from "@/components/admin/PurchaseRequestTracker";
import { WorksheetClosing } from "@/components/staff/WorksheetClosing";
import type { Department } from "@/lib/types/database";

type AdminWorksheetWorkspace = "po" | Department;

const WORKSPACES: {
  id: AdminWorksheetWorkspace;
  label: string;
  title: string;
  icon: typeof ShoppingCart;
}[] = [
  { id: "po", label: "PO", title: "PO Tracker", icon: ShoppingCart },
  { id: "bar", label: "Bar", title: "Worksheet Bar", icon: Building2 },
  { id: "kitchen", label: "Kitchen", title: "Worksheet Kitchen", icon: ClipboardList },
];

export function AdminWorksheetTab() {
  const [activeWorkspace, setActiveWorkspace] = useState<AdminWorksheetWorkspace>("po");
  const selected = WORKSPACES.find((item) => item.id === activeWorkspace) ?? WORKSPACES[0];
  const SelectedIcon = selected.icon;
  const department = activeWorkspace === "po" ? null : activeWorkspace;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
            <SelectedIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-100">{selected.title}</h2>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900/70 p-1">
          {WORKSPACES.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeWorkspace;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveWorkspace(item.id)}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition sm:gap-2 sm:px-3 sm:text-sm ${
                  active
                    ? "bg-emerald-400 text-zinc-950"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeWorkspace === "po" ? <PurchaseRequestTracker /> : null}

      {department ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/20">
          <WorksheetClosing key={department} department={department} title={selected.title} embedded />
        </div>
      ) : null}
    </div>
  );
}
