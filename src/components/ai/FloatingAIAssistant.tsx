"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";

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

  const askAi = async () => {
    const cleanQuestion = question.trim();
    if (!canSubmit || !session) return;

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

  return (
    <>
      {isOpen ? (
        <section className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-h-[min(720px,calc(100vh-24px))] max-w-[440px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40 sm:inset-x-auto sm:right-4 sm:w-[420px]">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 bg-zinc-900/80 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-zinc-950">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-zinc-100">Artha AI</p>
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                    Online
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

          <div ref={scrollRef} className="min-h-[280px] flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl border px-3.5 py-3 ${
                    message.role === "user"
                      ? "border-cyan-400/30 bg-cyan-400 text-zinc-950"
                      : "border-zinc-800 bg-zinc-900/80 text-zinc-100"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                  {message.meta ? <p className="mt-2 text-[11px] text-zinc-500">{message.meta}</p> : null}
                </div>
              </div>
            ))}
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lagi gue cek datanya...
              </div>
            ) : null}
          </div>

          <div className="border-t border-zinc-800 bg-zinc-950 p-3">
            <form
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
