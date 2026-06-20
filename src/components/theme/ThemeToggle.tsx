"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 ${className}`}
      aria-label={isLight ? "Aktifkan dark mode" : "Aktifkan light mode"}
      title={isLight ? "Aktifkan mode gelap" : "Aktifkan mode terang"}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="hidden sm:inline">{isLight ? "Gelap" : "Terang"}</span>
    </button>
  );
}
