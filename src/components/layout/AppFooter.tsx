import { AbdulCompanyMark } from "@/components/brand/AbdulCompanyMark";

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <AbdulCompanyMark size="sm" subtitle="Artha System" />
        <div className="flex flex-col gap-1 sm:items-end">
          <p className="font-medium text-slate-700">Operational workspace.</p>
          <p>
            (c) {year} Abdul Company | Asia/Jakarta
          </p>
        </div>
      </div>
    </footer>
  );
}
