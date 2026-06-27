"use client";

import type { ReactNode } from "react";

type WorksheetStickyActionBarProps = {
  children: ReactNode;
  variant?: "staff" | "admin";
};

export function WorksheetStickyActionBar({ children, variant = "staff" }: WorksheetStickyActionBarProps) {
  const admin = variant === "admin";

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md ${
        admin ? "px-5" : "px-3 sm:px-4"
      }`}
    >
      <div className={`mx-auto flex flex-col gap-2 ${admin ? "max-w-7xl" : "max-w-lg"}`}>
        {children}
      </div>
    </div>
  );
}
