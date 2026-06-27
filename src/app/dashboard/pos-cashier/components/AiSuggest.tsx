"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { CartItem, ProductMenu } from "../types";

type AiSuggestProps = {
  cartItems: CartItem[];
  products: ProductMenu[];
};

function pickAvailableProduct(products: ProductMenu[], category: ProductMenu["category"]): ProductMenu | null {
  return products.find((product) => product.category === category && product.isAvailable && product.currentStock > 0) ?? null;
}

export function AiSuggest({ cartItems, products }: AiSuggestProps) {
  const suggestion = useMemo(() => {
    if (cartItems.length === 0) return "Mulai dari menu utama, lalu tawarkan add-on yang stoknya aman.";

    const hasBar = cartItems.some((item) => products.find((product) => product.id === item.id)?.category === "bar");
    const hasKitchen = cartItems.some((item) => products.find((product) => product.id === item.id)?.category === "kitchen");

    if (hasKitchen && !hasBar) {
      const drink = pickAvailableProduct(products, "bar");
      return drink ? `Rekomendasi Upsell: Tawarkan ${drink.name}.` : "Rekomendasi Upsell: Tawarkan minuman signature bila stok bar siap.";
    }

    if (hasBar && !hasKitchen) {
      const food = pickAvailableProduct(products, "kitchen");
      return food ? `Rekomendasi Upsell: Tawarkan ${food.name}.` : "Rekomendasi Upsell: Tawarkan pastry atau snack pendamping.";
    }

    return "Rekomendasi Upsell: Tawarkan Extra Shot, Croissant, atau menu pairing dengan margin tinggi.";
  }, [cartItems, products]);

  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-teal-700 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-teal-100">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Smart Upsell</p>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-800">{suggestion}</p>
        </div>
      </div>
    </div>
  );
}
