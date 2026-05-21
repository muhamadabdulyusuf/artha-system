"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientRow } from "@/lib/types/database";

type IngredientSearchPickerProps = {
  department: Department;
  value: string;
  onChange: (ingredientId: string) => void;
  excludeIds?: string[];
  disabled?: boolean;
  placeholder?: string;
};

export function IngredientSearchPicker({
  department,
  value,
  onChange,
  excludeIds = [],
  disabled = false,
  placeholder = "Ketik nama bahan baku…",
}: IngredientSearchPickerProps) {
  const supabase = getSupabaseClient();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<IngredientRow[]>([]);
  const [selectedLabel, setSelectedLabel] = useState("");

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const base = options.filter((opt) => !excluded.has(opt.id) || opt.id === value);
    if (!term) return base;
    return base.filter((opt) => opt.name.toLowerCase().includes(term));
  }, [excluded, options, query, value]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel("");
      return;
    }

    const cached = options.find((opt) => opt.id === value);
    if (cached) {
      setSelectedLabel(`${cached.name} (${cached.unit})`);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from("ingredient")
        .select(
          "id, name, unit, department, kind, current_stock, minimum_stock, slow_moving_threshold_days, is_stock_tracked, is_active, created_at, updated_at"
        )
        .eq("id", value)
        .maybeSingle();

      if (cancelled || error || !data) return;
      setSelectedLabel(`${data.name} (${data.unit})`);
      setOptions((prev) => (prev.some((row) => row.id === data.id) ? prev : [...prev, data as IngredientRow]));
    })();

    return () => {
      cancelled = true;
    };
  }, [options, supabase, value]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true);

        let request = supabase
          .from("ingredient")
          .select("*")
          .eq("department", department)
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(40);

        const term = query.trim();
        if (term) {
          request = request.ilike("name", `%${term}%`);
        }

        const { data, error } = await request;

        if (cancelled) return;

        if (!error) {
          setOptions((data ?? []) as IngredientRow[]);
        }

        setIsLoading(false);
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [department, isOpen, query, supabase]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const displayValue = isOpen ? query : selectedLabel;

  const pickOption = (option: IngredientRow) => {
    onChange(option.id);
    setSelectedLabel(`${option.name} (${option.unit})`);
    setQuery("");
    setIsOpen(false);
  };

  const clearSelection = () => {
    onChange("");
    setSelectedLabel("");
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          disabled={disabled}
          value={displayValue}
          placeholder={value ? undefined : placeholder}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
            if (!isOpen && selectedLabel) setQuery(selectedLabel.split(" (")[0] ?? "");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (value) onChange("");
          }}
          className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 py-2.5 pl-10 pr-16 text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value ? (
            <button
              type="button"
              disabled={disabled}
              onClick={clearSelection}
              className="rounded p-1 text-zinc-400 hover:text-zinc-200"
              aria-label="Hapus pilihan bahan"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden />
        </div>
      </div>

      {isOpen && !disabled ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-600 bg-zinc-950 py-1 shadow-xl shadow-black/40"
        >
          {isLoading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Mencari di Supabase…
            </li>
          ) : filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">
              {query.trim() ? `Tidak ada bahan "${query.trim()}".` : "Ketik untuk mencari bahan baku."}
            </li>
          ) : (
            filteredOptions.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickOption(option)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-indigo-600/20 ${
                    option.id === value ? "bg-indigo-600/15 text-indigo-200" : "text-zinc-200"
                  }`}
                >
                  <span>{option.name}</span>
                  <span className="text-xs text-zinc-500">{option.unit}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
