"use client";

import { Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 ${className}`}
      aria-label="Mode terang aktif"
      title="Mode terang aktif"
    >
      <Sun className="h-4 w-4 text-teal-700" />
      <span className="hidden sm:inline">Terang</span>
    </button>
  );
}
