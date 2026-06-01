"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-zinc-50">Admin Worksheet</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Tempat kerja inventory/admin untuk input receive, out stock, opname, premix/WIP,
            remake, dan sales menu dari satu halaman Master Admin.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5">
          {DEPARTMENTS.map((item) => {
            const active = item.id === department;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setDepartment(item.id)}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${
                  active
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/40"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <WorksheetClosing key={department} department={department} title={selected.title} embedded />
    </div>
  );
}
