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
      className={`flex items-center justify-center ${fullScreen ? "min-h-screen bg-zinc-950 px-4" : "min-h-56 py-12"}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-xl shadow-black/20">
        <div className="flex items-start gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-zinc-950">
            <Loader2 className="h-5 w-5 animate-spin" />
            <Sparkles className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-zinc-950 p-0.5 text-cyan-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-zinc-100">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{detail}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full animate-pulse rounded-full bg-zinc-800" />
          <div className="h-2 w-2/3 animate-pulse rounded-full bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
