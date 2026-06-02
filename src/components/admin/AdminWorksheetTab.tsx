"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { PurchaseRequestTracker } from "@/components/admin/PurchaseRequestTracker";
import { WorksheetClosing } from "@/components/staff/WorksheetClosing";
import type { Department } from "@/lib/types/database";

const DEPARTMENTS: { id: Department; label: string; title: string }[] = [
  { id: "bar", label: "Bar", title: "Worksheet Admin Bar" },
  { id: "kitchen", label: "Kitchen", title: "Worksheet Admin Kitchen" },
];

export function AdminWorksheetTab() {
  const [department, setDepartment] = useState<Department>("bar");
  const selected = DEPARTMENTS.find((item) => item.id === department) ?? DEPARTMENTS[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Inventory Control Desk
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Full worksheet admin untuk input dan koreksi operasional.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {DEPARTMENTS.map((item) => {
            const active = item.id === department;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setDepartment(item.id)}
                className={`flex min-h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
                  active
                    ? "bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-950/40"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                <Building2 className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <PurchaseRequestTracker />

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/20">
        <WorksheetClosing key={department} department={department} title={selected.title} embedded />
      </div>
    </div>
  );
}
