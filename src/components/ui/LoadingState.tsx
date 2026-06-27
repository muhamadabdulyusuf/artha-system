import { Loader2, Sparkles } from "lucide-react";

type LoadingStateProps = {
  title?: string;
  detail?: string;
  fullScreen?: boolean;
};

export function LoadingState({
  title = "Memuat data",
  detail = "Sebentar, Artha System lagi nyusun data terbaru.",
  fullScreen = false,
}: LoadingStateProps) {
  return (
    <div
      className={`flex items-center justify-center ${fullScreen ? "min-h-screen bg-slate-50 px-4" : "min-h-56 py-12"}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
            <Sparkles className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 text-teal-700 ring-1 ring-teal-100" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{detail}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-2 w-2/3 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
