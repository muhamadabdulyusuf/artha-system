"use client";

import type { ReactNode } from "react";

type WorksheetStickyActionBarProps = {
  children: ReactNode;
};

export function WorksheetStickyActionBar({ children }: WorksheetStickyActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg flex-col gap-2">{children}</div>
    </div>
  );
}
