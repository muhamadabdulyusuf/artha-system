"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Gauge,
  Loader2,
  MessageCircle,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  ShoppingCart,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";
import { canUseAiAssistant } from "@/lib/auth/permissions";

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
  confidence?: "high" | "medium" | "low";
  sources?: string[];
  actionHints?: string[];
};

type AiResponse = {
  answer?: string;
  provider?: string;
  model?: string;
  context?: {
    businessDate?: string;
    intents?: string[];
    aiProviders?: AiProviderStatus[];
  };
  quality?: {
    confidence?: "high" | "medium" | "low";
    sources?: string[];
    actionHints?: string[];
  };
  error?: string;
};

type OperationsBriefing = {
  stockHealth?: {
    lowStockCount?: number;
    openPurchaseCount?: number;
    overduePurchaseCount?: number;
    activeMenuWithoutRecipeCount?: number;
    businessMemoryCount?: number;
  };
  reorderRecommendations?: { ingredient?: string; suggestedQty?: number; unit?: string }[];
  purchaseArrivalRisks?: { item?: string; risk?: string }[];
  fastMovingMenus?: { menu?: string; sold30d?: number }[];
  dataQualityWarnings?: { item?: string }[];
};

type AiBusinessMemory = {
  id?: string;
  title?: string;
  content?: string;
  tags?: string[];
  department?: "bar" | "kitchen" | null;
  importance?: number;
  createdAt?: string;
};

type AiProviderStatus = {
  provider: "groq" | "gemini" | "openrouter" | "mistral" | "cohere";
  model: string;
  configured: boolean;
  keyEnv: string;
  order: number;
};

type AiBriefingResponse = {
  context?: {
    businessDate?: string;
    operationsSummary?: OperationsBriefing;
    businessMemories?: AiBusinessMemory[];
    aiProviders?: AiProviderStatus[];
  };
  error?: string;
};

const DAILY_NOTES = [
  "Mulai rapi, selesai lebih ringan.",
  "Satu data akurat bisa nyelametin satu shift.",
  "Pelan boleh, asal stoknya jelas.",
  "Kerja bagus dimulai dari angka yang jujur.",
  "Fokus ke yang penting dulu.",
  "Hari ini kita rapihin yang bisa dirapihin.",
  "Keputusan enak lahir dari data yang bersih.",
];

const QUICK_PROMPTS = [
  "Briefing operasi hari ini",
  "Rekomendasi bahan yang harus dibeli",
  "Menu paling laku 30 hari",
  "Data fundamental mana yang perlu dirapihin?",
];

const CONFIDENCE_LABEL: Record<NonNullable<AiMessage["confidence"]>, string> = {
  high: "Akurat tinggi",
  medium: "Perlu cek cepat",
  low: "Data kurang",
};

const CONFIDENCE_CLASS: Record<NonNullable<AiMessage["confidence"]>, string> = {
  high: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  low: "border-red-400/30 bg-red-400/10 text-red-200",
};

function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDailyNote(): string {
  const now = new Date();
  const seed = Number(`${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}`);
  return DAILY_NOTES[seed % DAILY_NOTES.length];
}

function friendlyError(message: string): string {
  if (message.includes("ai_business_memory") || message.toLowerCase().includes("could not find the table")) {
    return "Memori AI belum aktif di database. Jalankan migration 041 dulu, lalu coba lagi.";
  }
  if (message.includes("API_KEY belum tersedia")) {
    return "Key AI belum kebaca di environment server. Cek env deployment, lalu redeploy.";
  }
  if (message.toLowerCase().includes("rate limit")) {
    return "Provider AI lagi kena rate limit sebentar. Coba kirim lagi beberapa detik lagi.";
  }
  return message;
}

export function FloatingAIAssistant() {
  const pathname = usePathname();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [briefing, setBriefing] = useState<OperationsBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [businessMemories, setBusinessMemories] = useState<AiBusinessMemory[]>([]);
  const [aiProviders, setAiProviders] = useState<AiProviderStatus[]>([]);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [memoryNote, setMemoryNote] = useState("");
  const [memorySaving, setMemorySaving] = useState(false);
  const [archivingMemoryId, setArchivingMemoryId] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Gue di sini. Tanya langsung soal stok, menu, resep, PO, sales, atau hal operasional Artha.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fetchedBriefingForSessionRef = useRef<string | null>(null);

  const dailyNote = useMemo(getDailyNote, []);
  const canSubmit = question.trim().length >= 3 && !isLoading;
  const smartPrompts = useMemo(() => {
    const health = briefing?.stockHealth;
    const prompts = new Set<string>(["Briefing operasi hari ini"]);

    if ((health?.lowStockCount ?? 0) > 0 || (briefing?.reorderRecommendations?.length ?? 0) > 0) {
      prompts.add("Rekomendasi bahan yang harus dibeli");
    }
    if ((health?.overduePurchaseCount ?? 0) > 0 || (briefing?.purchaseArrivalRisks?.length ?? 0) > 0) {
      prompts.add("PO mana yang overdue atau belum ada ETA?");
    }
    if ((briefing?.fastMovingMenus?.length ?? 0) > 0) {
      prompts.add("Menu paling laku 30 hari");
    }
    if ((health?.activeMenuWithoutRecipeCount ?? 0) > 0 || (briefing?.dataQualityWarnings?.length ?? 0) > 0) {
      prompts.add("Data fundamental mana yang perlu dirapihin?");
    }
    if ((health?.businessMemoryCount ?? 0) > 0) {
      prompts.add("Apa yang kamu ingat tentang bisnis ini?");
    }

    return Array.from(prompts).slice(0, 4);
  }, [briefing]);
  const promptOptions = smartPrompts.length > 0 ? smartPrompts : QUICK_PROMPTS;
  const canAccessAi = canUseAiAssistant(session?.role);
  const canManageMemory = canAccessAi;
  const canSaveMemory = memoryNote.trim().length >= 3 && !memorySaving;
  const configuredProviderCount = aiProviders.filter((provider) => provider.configured).length;
  const providerHealthText =
    aiProviders.length > 0 ? `${configuredProviderCount}/${aiProviders.length} engine siap` : "Engine belum dicek";

  useEffect(() => {
    setSession(getStaffSession());
  }, [pathname]);

  const loadBriefing = useCallback(
    async (force = false) => {
      if (!isOpen || !session || !canAccessAi) return;
      if (!force && fetchedBriefingForSessionRef.current === session.id) return;

      fetchedBriefingForSessionRef.current = session.id;
      setBriefingLoading(true);
      setBriefingError(null);

      try {
        const response = await fetch("/api/ai/database-assistant");
        const data = (await response.json()) as AiBriefingResponse;
        if (!response.ok || data.error) throw new Error(data.error || "Briefing AI gagal.");
        setBriefing(data.context?.operationsSummary ?? null);
        setBusinessMemories(data.context?.businessMemories ?? []);
        setAiProviders(data.context?.aiProviders ?? []);
      } catch (error) {
        setBriefingError(friendlyError(error instanceof Error ? error.message : "Briefing AI gagal."));
        fetchedBriefingForSessionRef.current = null;
      } finally {
        setBriefingLoading(false);
      }
    },
    [canAccessAi, isOpen, session],
  );

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isOpen]);

  const askAi = async (overrideQuestion?: string) => {
    const cleanQuestion = (overrideQuestion ?? question).trim();
    if (cleanQuestion.length < 3 || isLoading || !session || !canAccessAi) return;

    const history = messages
      .filter((message) => message.id !== "welcome")
      .slice(-6)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const userMessage: AiMessage = {
      id: newMessageId(),
      role: "user",
      content: cleanQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/database-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion, history }),
      });
      const data = (await response.json()) as AiResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "AI request gagal.");
      }

      const metaParts = [
        data.provider && data.model ? `${data.provider} / ${data.model}` : "",
        data.context?.businessDate ? `BD ${data.context.businessDate}` : "",
        data.context?.intents?.length ? data.context.intents.join(", ") : "",
      ].filter(Boolean);
      if (data.context?.aiProviders) {
        setAiProviders(data.context.aiProviders);
      }

      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          content: data.answer || "Gue belum dapat jawaban dari provider AI.",
          meta: metaParts.join(" · "),
          confidence: data.quality?.confidence,
          sources: data.quality?.sources?.slice(0, 4),
          actionHints: data.quality?.actionHints?.slice(0, 3),
        },
      ]);

      if (data.model === "business-memory") {
        await loadBriefing(true);
      }
    } catch (error) {
      const message = friendlyError(error instanceof Error ? error.message : "AI request gagal.");
      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!session || !canAccessAi) return null;

  const submitPrompt = (nextQuestion: string) => {
    if (isLoading) return;
    void askAi(nextQuestion);
  };

  const saveMemory = async () => {
    const cleanNote = memoryNote.trim();
    if (cleanNote.length < 3 || memorySaving) return;

    setMemorySaving(true);
    setMemoryNotice(null);

    try {
      const response = await fetch("/api/ai/database-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: `catat ${cleanNote}`, history: [] }),
      });
      const data = (await response.json()) as AiResponse;
      if (!response.ok || data.error) throw new Error(data.error || "Memori AI gagal disimpan.");

      setMemoryNote("");
      setMemoryNotice({ message: "Catatan tersimpan.", variant: "success" });
      setMessages((current) => [
        ...current,
        {
          id: newMessageId(),
          role: "assistant",
          content: data.answer || `Udah gue catat: ${cleanNote}`,
          meta: data.model ? `artha-local / ${data.model}` : "artha-local",
          confidence: data.quality?.confidence,
          sources: data.quality?.sources?.slice(0, 4),
          actionHints: data.quality?.actionHints?.slice(0, 3),
        },
      ]);
      await loadBriefing(true);
    } catch (error) {
      setMemoryNotice({
        message: friendlyError(error instanceof Error ? error.message : "Memori AI gagal disimpan."),
        variant: "error",
      });
    } finally {
      setMemorySaving(false);
    }
  };

  const archiveMemory = async (memoryId?: string) => {
    if (!memoryId || archivingMemoryId) return;

    setArchivingMemoryId(memoryId);
    setMemoryNotice(null);

    try {
      const response = await fetch("/api/ai/database-assistant", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "Archive memori AI gagal.");

      setBusinessMemories((current) => current.filter((memory) => memory.id !== memoryId));
      setMemoryNotice({ message: "Catatan di-archive.", variant: "success" });
      await loadBriefing(true);
    } catch (error) {
      setMemoryNotice({
        message: friendlyError(error instanceof Error ? error.message : "Archive memori AI gagal."),
        variant: "error",
      });
    } finally {
      setArchivingMemoryId(null);
    }
  };

  return (
    <>
      {isOpen ? (
        <section className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-h-[min(760px,calc(100vh-24px))] max-w-[460px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 sm:inset-x-auto sm:right-4 sm:w-[440px]">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900/90 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-950/30">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-zinc-100">Artha AI</p>
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                    Database aware
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{dailyNote}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMemoryPanelOpen((current) => !current)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  memoryPanelOpen
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
                aria-label="Buka memori AI"
              >
                <Database className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMessages([
                    {
                      id: "welcome",
                      role: "assistant",
                      content:
                        "Gue di sini. Tanya langsung soal stok, menu, resep, PO, sales, atau hal operasional Artha.",
                    },
                  ]);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
                aria-label="Reset chat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
                aria-label="Tutup Artha AI"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            {briefingLoading ? (
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
                Nyiapin briefing operasi...
              </div>
            ) : briefing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => submitPrompt("Apa aja bahan yang low stock hari ini?")}
                    className="min-h-16 rounded-lg border border-zinc-800 bg-zinc-900/65 p-2.5 text-left transition hover:border-amber-400/50"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                      Low Stock
                    </div>
                    <p className="mt-1 text-lg font-bold text-zinc-100">{briefing.stockHealth?.lowStockCount ?? 0}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => submitPrompt("PO mana yang overdue atau belum ada ETA?")}
                    className="min-h-16 rounded-lg border border-zinc-800 bg-zinc-900/65 p-2.5 text-left transition hover:border-cyan-400/50"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                      <ShoppingCart className="h-3.5 w-3.5 text-cyan-300" />
                      PO Open
                    </div>
                    <p className="mt-1 text-lg font-bold text-zinc-100">
                      {briefing.stockHealth?.openPurchaseCount ?? 0}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => submitPrompt("Menu paling laku 30 hari")}
                    className="min-h-16 rounded-lg border border-zinc-800 bg-zinc-900/65 p-2.5 text-left transition hover:border-emerald-400/50"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
                      Top Menu
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-zinc-100">
                      {briefing.fastMovingMenus?.[0]?.menu ?? "Belum ada sales"}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => submitPrompt("Data fundamental mana yang perlu dirapihin?")}
                    className="min-h-16 rounded-lg border border-zinc-800 bg-zinc-900/65 p-2.5 text-left transition hover:border-red-400/50"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
                      <ClipboardCheck className="h-3.5 w-3.5 text-red-300" />
                      Data Check
                    </div>
                    <p className="mt-1 text-lg font-bold text-zinc-100">
                      {briefing.dataQualityWarnings?.length ?? 0}
                    </p>
                  </button>
                </div>
                {aiProviders.length > 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/55 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Gauge className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                        <p className="truncate text-xs font-bold text-zinc-100">AI Engine</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                          configuredProviderCount > 0
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                            : "border-red-400/30 bg-red-400/10 text-red-200"
                        }`}
                      >
                        {providerHealthText}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {aiProviders.map((provider) => (
                        <span
                          key={provider.provider}
                          title={`${provider.keyEnv} · ${provider.model}`}
                          className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                            provider.configured
                              ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                              : "border-zinc-700 bg-zinc-950/70 text-zinc-500"
                          }`}
                        >
                          {provider.order}. {provider.provider}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {briefing.reorderRecommendations?.[0] ? (
                  <button
                    type="button"
                    onClick={() => submitPrompt("Rekomendasi bahan yang harus dibeli")}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-left text-xs font-semibold text-amber-100 transition hover:border-amber-300/50"
                  >
                    <span className="min-w-0 truncate">
                      Prioritas beli: {briefing.reorderRecommendations[0].ingredient}
                    </span>
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  </button>
                ) : null}
                {(briefing.stockHealth?.businessMemoryCount ?? 0) > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMemoryPanelOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-left text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/50"
                  >
                    <span className="min-w-0 truncate">
                      Memori aktif: {briefing.stockHealth?.businessMemoryCount} catatan bisnis
                    </span>
                    <Database className="h-3.5 w-3.5 shrink-0" />
                  </button>
                ) : null}
              </div>
            ) : briefingError ? (
              <p className="text-xs leading-relaxed text-amber-200">{briefingError}</p>
            ) : null}
          </div>

          {memoryPanelOpen ? (
            <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveMemory();
                }}
              >
                <textarea
                  value={memoryNote}
                  onChange={(event) => setMemoryNote(event.target.value)}
                  placeholder="Catatan bisnis..."
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30"
                />
                <button
                  type="submit"
                  disabled={!canSaveMemory}
                  className="flex h-11 min-w-11 items-center justify-center rounded-lg bg-cyan-400 px-3 text-xs font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Simpan catatan memori"
                >
                  {memorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </button>
              </form>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => submitPrompt("Apa yang kamu ingat tentang bisnis ini?")}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-zinc-700 px-2.5 text-[11px] font-semibold text-zinc-300 transition hover:border-cyan-400/50 hover:text-cyan-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Tanya Memori
                </button>
                <button
                  type="button"
                  onClick={() => void loadBriefing(true)}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-zinc-700 px-2.5 text-[11px] font-semibold text-zinc-300 transition hover:border-cyan-400/50 hover:text-cyan-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setMemoryNote("")}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-zinc-700 px-2.5 text-[11px] font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              </div>

              {memoryNotice ? (
                <p
                  className={`mt-2 text-xs ${
                    memoryNotice.variant === "success" ? "text-emerald-200" : "text-amber-200"
                  }`}
                >
                  {memoryNotice.message}
                </p>
              ) : null}

              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                {businessMemories.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/55 px-3 py-2 text-xs text-zinc-500">
                    Belum ada catatan memori aktif.
                  </div>
                ) : (
                  businessMemories.slice(0, 8).map((memory) => (
                    <div key={memory.id ?? memory.content} className="rounded-lg border border-zinc-800 bg-zinc-900/55 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-xs font-semibold text-zinc-100">
                            {memory.title || "Catatan bisnis"}
                          </p>
                          <p className="mt-1 break-words text-xs leading-relaxed text-zinc-400">{memory.content}</p>
                        </div>
                        {canManageMemory ? (
                          <button
                            type="button"
                            onClick={() => void archiveMemory(memory.id)}
                            disabled={!memory.id || archivingMemoryId === memory.id}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition hover:border-red-400/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Archive memori"
                          >
                            {archivingMemoryId === memory.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : null}
                      </div>
                      {memory.tags?.length || memory.department ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {memory.department ? (
                            <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-400">
                              {memory.department}
                            </span>
                          ) : null}
                          {memory.tags?.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div ref={scrollRef} className="min-h-[300px] flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 1 ? (
              <div className="grid grid-cols-1 gap-2">
                {promptOptions.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitPrompt(prompt)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/55 px-3 py-2.5 text-left text-xs font-semibold text-zinc-300 transition hover:border-cyan-400/50 hover:text-cyan-100"
                  >
                    <span className="leading-snug">{prompt}</span>
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                  </button>
                ))}
              </div>
            ) : null}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-2xl border px-3.5 py-3 ${
                    message.role === "user"
                      ? "border-cyan-400/30 bg-cyan-400 text-zinc-950"
                      : "border-zinc-800 bg-zinc-900/80 text-zinc-100"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                  {message.role === "assistant" && (message.confidence || message.sources?.length || message.meta) ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {message.confidence ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${CONFIDENCE_CLASS[message.confidence]}`}
                          >
                            <Gauge className="h-3 w-3" />
                            {CONFIDENCE_LABEL[message.confidence]}
                          </span>
                        ) : null}
                        {message.sources?.map((source) => (
                          <span
                            key={source}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950/70 px-2 py-1 text-[11px] font-medium text-zinc-400"
                          >
                            <Database className="h-3 w-3" />
                            {source}
                          </span>
                        ))}
                      </div>
                      {message.actionHints?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {message.actionHints.map((hint) => (
                            <span
                              key={hint}
                              className="inline-flex items-center gap-1 rounded-md bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {hint}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {message.meta ? <p className="text-[11px] text-zinc-500">{message.meta}</p> : null}
                    </div>
                  ) : message.meta ? (
                    <p className="mt-2 text-[11px] text-zinc-500">{message.meta}</p>
                  ) : null}
                </div>
              </div>
            ))}
            {isLoading ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-3 text-sm text-zinc-400">
                <div className="mb-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                  Lagi gue cek database Artha...
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-4/5 animate-pulse rounded-full bg-zinc-800" />
                  <div className="h-2 w-3/5 animate-pulse rounded-full bg-zinc-800" />
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-zinc-800 bg-zinc-950 p-3">
            <form
              id="artha-ai-form"
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void askAi();
              }}
            >
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askAi();
                  }
                }}
                placeholder="Tanya langsung ke Artha AI..."
                className="max-h-32 min-h-12 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Kirim pertanyaan"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </form>
          </div>
        </section>
      ) : (
        <div className="fixed bottom-4 right-4 z-[70] flex max-w-[calc(100vw-32px)] items-end gap-3">
          <div className="hidden max-w-[230px] rounded-2xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 text-xs font-medium leading-relaxed text-zinc-200 shadow-xl shadow-black/30 backdrop-blur sm:block">
            <span className="text-cyan-300">Hari ini:</span> {dailyNote}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="artha-ai-float-button relative flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400 text-zinc-950 shadow-2xl shadow-cyan-950/40 transition hover:bg-cyan-300 focus:outline-none focus:ring-4 focus:ring-cyan-300/30"
            aria-label="Buka Artha AI"
          >
            <MessageCircle className="h-7 w-7" />
            <Sparkles className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-full bg-zinc-950 p-0.5 text-cyan-300" />
          </button>
        </div>
      )}
    </>
  );
}
