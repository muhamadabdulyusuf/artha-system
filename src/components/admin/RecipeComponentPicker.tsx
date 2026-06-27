"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientKind, IngredientRow } from "@/lib/types/database";

type RecipeComponentPickerProps = {
  department?: Department;
  value: string;
  onChange: (ingredientId: string) => void;
  excludeIds?: string[];
  disabled?: boolean;
  placeholder?: string;
  showDepartment?: boolean;
  /** Hide the target premix from its own recipe (self-reference). */
  excludeSelfId?: string;
};

function KindBadge({ kind }: { kind: IngredientKind }) {
  if (kind === "premix") {
    return (
      <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        Premix
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
      Raw
    </span>
  );
}

export function RecipeComponentPicker({
  department,
  value,
  onChange,
  excludeIds = [],
  disabled = false,
  placeholder = "Cari bahan raw atau premix…",
  showDepartment = false,
  excludeSelfId,
}: RecipeComponentPickerProps) {
  const supabase = getSupabaseClient();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<IngredientRow[]>([]);
  const [selectedLabel, setSelectedLabel] = useState("");

  const excluded = useMemo(() => {
    const set = new Set(excludeIds);
    if (excludeSelfId) set.add(excludeSelfId);
    return set;
  }, [excludeIds, excludeSelfId]);

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
      setSelectedLabel(cached.name);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from("ingredient")
        .select("*")
        .eq("id", value)
        .maybeSingle();

      if (cancelled || error || !data) return;
      setSelectedLabel(data.name);
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
          .eq("is_active", true)
          .order("kind", { ascending: true })
          .order("department", { ascending: true })
          .order("name", { ascending: true })
          .limit(50);

        if (department) {
          request = request.eq("department", department);
        }

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
    setSelectedLabel(option.name);
    setQuery("");
    setIsOpen(false);
  };

  const clearSelection = () => {
    onChange("");
    setSelectedLabel("");
    setQuery("");
    setIsOpen(false);
  };

  const selectedOption = options.find((o) => o.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
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
            if (!isOpen && selectedLabel) setQuery(selectedLabel);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (value) onChange("");
          }}
          className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-24 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {value && selectedOption ? <KindBadge kind={selectedOption.kind} /> : null}
          {value ? (
            <button
              type="button"
              disabled={disabled}
              onClick={clearSelection}
              className="rounded p-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="Hapus pilihan"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <ChevronDown className="h-4 w-4 text-slate-600" aria-hidden />
        </div>
      </div>

      {isOpen && !disabled ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)] scrollbar-thin"
        >
          {isLoading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Mencari…
            </li>
          ) : filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-600">
              {query.trim() ? `Tidak ada bahan "${query.trim()}".` : "Ketik untuk mencari bahan."}
            </li>
          ) : (
            filteredOptions.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickOption(option)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                    option.id === value ? "bg-teal-50 text-teal-700" : "text-slate-800"
                  }`}
                >
                    <span className="min-w-0 truncate">{option.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <KindBadge kind={option.kind} />
                    {showDepartment ? (
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {option.department}
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-600">{option.unit}</span>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
