"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  Database,
  Gauge,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";

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
  };
  quality?: {
    confidence?: "high" | "medium" | "low";
    sources?: string[];
    actionHints?: string[];
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
  "Apa aja bahan yang low stock hari ini?",
  "Menu apa aja yang pake daun basil?",
  "Berapa average penjualan Signature Abura?",
  "PO mana yang belum datang?",
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
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Gue di sini. Tanya langsung soal stok, menu, resep, PO, sales, atau hal operasional Artha.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dailyNote = useMemo(getDailyNote, []);
  const canSubmit = question.trim().length >= 3 && !isLoading;

  useEffect(() => {
    setSession(getStaffSession());
  }, [pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isOpen]);

  const askAi = async (overrideQuestion?: string) => {
    const cleanQuestion = (overrideQuestion ?? question).trim();
    if (cleanQuestion.length < 3 || isLoading || !session) return;

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

  if (!session) return null;

  const submitPrompt = (nextQuestion: string) => {
    if (isLoading) return;
    void askAi(nextQuestion);
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

          <div ref={scrollRef} className="min-h-[300px] flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 1 ? (
              <div className="grid grid-cols-1 gap-2">
                {QUICK_PROMPTS.map((prompt) => (
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
