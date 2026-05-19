"use client";

import { useEffect } from "react";

export type ToastVariant = "success" | "error" | "warning";

type ToastProps = {
  /** Teks tunggal (mode sederhana, kompatibel komponen lama) */
  message: string | null;
  title?: string | null;
  description?: string | null;
  variant?: ToastVariant;
  /** Durasi tampil (ms). Default: sukses 3,2s; error/warning 6s */
  durationMs?: number;
  /** Tailwind position classes; default clears sticky worksheet action bar */
  positionClassName?: string;
  onDismiss: () => void;
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border border-emerald-500/40 bg-emerald-950 text-emerald-200",
  error: "border border-red-500/50 bg-red-950 text-red-100",
  warning: "border border-amber-500/50 bg-amber-950 text-amber-100",
};

function defaultDuration(variant: ToastVariant): number {
  return variant === "success" ? 3200 : 6000;
}

export function Toast({
  message,
  title,
  description,
  variant = "success",
  durationMs,
  positionClassName = "bottom-24",
  onDismiss,
}: ToastProps) {
  const visible = Boolean(message || title || description);

  useEffect(() => {
    if (!visible) return;
    const ms = durationMs ?? defaultDuration(variant);
    const timer = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(timer);
  }, [visible, message, title, description, durationMs, variant, onDismiss]);

  if (!visible) return null;

  const body = description ?? message ?? "";
  const heading = title ?? (!description && message ? null : title);

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`fixed left-1/2 z-[100] w-[min(100%,22rem)] -translate-x-1/2 rounded-xl px-4 py-3 shadow-lg ${positionClassName} ${VARIANT_STYLES[variant]}`}
    >
      {heading ? (
        <p className="text-left text-sm font-bold leading-snug">{heading}</p>
      ) : null}
      {body ? (
        <p
          className={`text-left text-sm leading-snug ${
            heading ? "mt-1.5 font-normal opacity-95" : "font-medium"
          }`}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}
