"use client";

import type { ReactNode } from "react";

type WorksheetStickyActionBarProps = {
  children: ReactNode;
};

export function WorksheetStickyActionBar({ children }: WorksheetStickyActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/80 bg-zinc-950/90 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-4">
      <div className="mx-auto flex max-w-lg flex-col gap-2">{children}</div>
    </div>
  );
}
