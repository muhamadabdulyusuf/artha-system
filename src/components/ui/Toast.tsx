"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  variant?: "success" | "error";
  onDismiss: () => void;
};

export function Toast({ message, variant = "success", onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 z-[100] max-w-sm -translate-x-1/2 rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg ${
        variant === "success"
          ? "border border-emerald-500/40 bg-emerald-950 text-emerald-200"
          : "border border-red-500/40 bg-red-950 text-red-200"
      }`}
    >
      {message}
    </div>
  );
}
