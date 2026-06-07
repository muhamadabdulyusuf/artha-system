"use client";

import { useMemo, useState } from "react";
import { Bot, Loader2, Search, Send, Sparkles, X } from "lucide-react";

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
};

type AiResponse = {
  answer?: string;
  provider?: string;
  model?: string;
  context?: {
    businessDate?: string;
    intents?: string[];
    searchTerms?: string[];
  };
  error?: string;
};

const QUICK_PROMPTS = [
  "Bahan apa yang stoknya low hari ini?",
  "PO mana yang belum datang dan harus dikejar?",
  "Menu apa yang turun dibanding minggu lalu?",
  "Cari menu grade D yang masih aktif.",
  "Ada remake atau complaint terbaru?",
  "Supplier mana yang paling sering dipakai untuk PO terbuka?",
];

function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function DatabaseAIAssistant() {
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Siap. Tanyakan stok, PO, menu sales, supplier, ledger, remake, atau demand event. Gue akan cari di database Artha dan kasih jawaban operasional.",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = question.trim().length >= 3 && !isLoading;
  const lastProvider = useMemo(() => {
    const latest = [...messages].reverse().find((message) => message.role === "assistant" && message.meta);
    return latest?.meta ?? "";
  }, [messages]);

  const askAi = async (nextQuestion = question) => {
    const cleanQuestion = nextQuestion.trim();
    if (cleanQuestion.length < 3 || isLoading) return;

    const userMessage: AiMessage = {
      id: newMessageId(),
      role: "user",
      content: cleanQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/database-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleanQuestion }),
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
          content: data.answer || "AI tidak mengembalikan jawaban.",
          meta: metaParts.join(" · "),
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request gagal.";
      setError(message);
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

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-xl shadow-black/20">
      <div className="border-b border-zinc-800 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10">
              <Bot className="h-5 w-5 text-emerald-300" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100">Artha AI</h2>
                <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                  Database-aware
                </span>
              </div>
              {lastProvider ? <p className="mt-1 text-xs text-zinc-500">{lastProvider}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isLoading}
              onClick={() => void askAi(prompt)}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs font-semibold text-zinc-300 transition hover:border-emerald-500/50 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[560px] space-y-3 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/35 px-4 py-10 text-center text-sm text-zinc-500">
            <Search className="mx-auto mb-3 h-6 w-6 text-zinc-600" />
            Tanyakan data operasional Artha.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[min(100%,820px)] rounded-xl border px-4 py-3 ${
                  message.role === "user"
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-50"
                    : "border-zinc-800 bg-zinc-900/70 text-zinc-200"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                {message.meta ? <p className="mt-2 text-[11px] text-zinc-500">{message.meta}</p> : null}
              </div>
            </div>
          ))
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Mencari database dan menyusun jawaban...
          </div>
        ) : null}
      </div>

      <div className="border-t border-zinc-800 p-4 sm:p-5">
        {error ? (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void askAi();
              }
            }}
            placeholder="Contoh: cari bahan low stock yang suppliernya belum ada PO..."
            className="min-h-20 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void askAi()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:self-stretch"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ask
          </button>
        </div>
      </div>
    </section>
  );
}
