import { AbdulCompanyMark } from "@/components/brand/AbdulCompanyMark";

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950/95">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <AbdulCompanyMark size="sm" subtitle="Artha System" />
        <div className="flex flex-col gap-1 sm:items-end">
          <p className="font-medium text-zinc-400">Operational workspace.</p>
          <p>
            (c) {year} Abdul Company | Asia/Jakarta
          </p>
        </div>
      </div>
    </footer>
  );
}
