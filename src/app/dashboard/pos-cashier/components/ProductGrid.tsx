"use client";

import { Search, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProductMenu } from "../types";

type ProductGridProps = {
  products: ProductMenu[];
  loading: boolean;
  onSelectProduct: (product: ProductMenu) => void;
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function categoryLabel(category: ProductMenu["category"]): string {
  return category === "bar" ? "Bar" : "Kitchen";
}

function ProductSkeleton() {
  return (
    <>
      {Array.from({ length: 12 }).map((_, index) => (
        <div
          key={index}
          className="min-h-32 animate-pulse rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-24 rounded bg-slate-100" />
          <div className="mt-6 flex items-center justify-between">
            <div className="h-6 w-16 rounded-full bg-slate-100" />
            <div className="h-4 w-12 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </>
  );
}

export function ProductGrid({ products, loading, onSelectProduct }: ProductGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    if (!normalizedSearch) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch)
    );
  }, [normalizedSearch, products]);

  return (
    <section className="min-w-0 space-y-4 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-700">Menu Grid</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Pilih produk</h2>
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cari menu cepat..."
              className="min-h-11 w-full rounded-lg border border-slate-200/80 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-100"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
        {loading ? <ProductSkeleton /> : null}

        {!loading && filteredProducts.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200/80 bg-white px-5 py-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
            <UtensilsCrossed className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Menu tidak ditemukan.</p>
            <p className="mt-1 text-sm text-slate-600">Coba kata kunci lain atau cek master menu.</p>
          </div>
        ) : null}

        {!loading
          ? filteredProducts.map((product) => {
              const disabled = !product.isAvailable || product.currentStock <= 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectProduct(product)}
                  className={`min-h-32 rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 ${
                    disabled
                      ? "cursor-not-allowed opacity-60 grayscale"
                      : "hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)] active:scale-[0.99]"
                  }`}
                >
                  <div className="flex h-full flex-col justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight text-slate-900">{product.name}</h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            product.category === "bar"
                              ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                              : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                          }`}
                        >
                          {categoryLabel(product.category)}
                        </span>
                      </div>
                      <p className="text-xs font-semibold tabular-nums text-slate-900">{formatRupiah(product.price)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          disabled
                            ? "rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                            : product.currentStock <= 5
                              ? "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
                              : "rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                        }
                      >
                        {disabled ? "Bahan Habis" : `${product.currentStock.toLocaleString("id-ID")} porsi`}
                      </span>
                      <span className="hidden text-xs font-medium text-slate-600 sm:inline">Tap</span>
                    </div>
                  </div>
                </button>
              );
            })
          : null}
      </div>
    </section>
  );
}
