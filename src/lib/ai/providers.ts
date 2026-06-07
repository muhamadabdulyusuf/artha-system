import type { DatabaseAssistantContext } from "@/lib/ai/databaseContext";

type AiProviderName = "groq" | "gemini" | "mistral";

export type AiProviderResult = {
  provider: AiProviderName;
  model: string;
  answer: string;
};

type ChatPayload = {
  question: string;
  context: DatabaseAssistantContext;
  history?: {
    role: "user" | "assistant";
    content: string;
  }[];
};

const SYSTEM_PROMPT = [
  "Kamu adalah Artha AI, asisten virtual personal untuk Abdul Company.",
  "Bicara natural, hangat, percaya diri, dan langsung ke jawaban; jangan terdengar seperti template atau robot.",
  "Jawab dalam Bahasa Indonesia yang jelas, ringkas, dan actionable dengan gaya internal yang santai-profesional.",
  "Hindari pembuka generik seperti 'Halo' dan penutup generik seperti 'Semoga membantu'; jawab seperti rekan kerja yang sigap.",
  "Gunakan hanya data JSON yang diberikan. Jangan mengarang angka, status, atau nama item.",
  "Kalau data tidak cukup, bilang persis data apa yang tidak ditemukan lalu berikan opsi paling dekat dari database.",
  "Prioritaskan nama menu/bahan/supplier, jumlah, tanggal, status PO, dan rekomendasi tindakan.",
  "Untuk pertanyaan bahan yang dipakai sebuah menu, gunakan database.menuRecipeMatches lebih dulu, lalu database.menuIngredientMatches.",
  "Untuk pertanyaan daftar menu atau nama menu, gunakan database.menuCatalog dan database.matchedMenus.",
  "Untuk pertanyaan average penjualan menu, gunakan avgDailySold30d, avgDailyRevenue30d, activeSalesDays, dan sold 30 hari.",
  "Jangan mengganti menu exact dengan kandidat terdekat; kalau nama exact tidak ada, bilang tidak ditemukan lalu tampilkan kandidat yang mirip.",
  "Pakai riwayat chat hanya untuk memahami referensi seperti 'itu', 'menu tadi', atau pertanyaan lanjutan.",
  "Jangan tampilkan raw JSON kecuali diminta.",
].join(" ");

function buildUserPrompt({ question, context, history }: ChatPayload): string {
  const recentHistory =
    history && history.length > 0
      ? history
          .slice(-6)
          .map((message) => `${message.role === "user" ? "User" : "Artha AI"}: ${message.content}`)
          .join("\n")
      : "";

  return [
    recentHistory ? `Riwayat chat terbaru:\n${recentHistory}` : "",
    `Pertanyaan user: ${question}`,
    "Data database Artha:",
    JSON.stringify(context),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function cleanAssistantAnswer(answer: string): string {
  return answer
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return normalized !== "halo!" && !/^semoga (informasi ini )?membantu!?$/.test(normalized);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function callGroq(payload: ChatPayload): Promise<AiProviderResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY belum tersedia.");

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(payload) },
      ],
    }),
  });

  const data = (await parseJsonResponse(response)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Groq request gagal.");
  }

  const answer = cleanAssistantAnswer(data.choices?.[0]?.message?.content?.trim() ?? "");
  if (!answer) throw new Error("Groq tidak mengembalikan jawaban.");
  return { provider: "groq", model, answer };
}

async function callGemini(payload: ChatPayload): Promise<AiProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum tersedia.");

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt(payload) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
        },
      }),
    },
  );

  const data = (await parseJsonResponse(response)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message || "Gemini request gagal.");

  const answer = cleanAssistantAnswer(
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "",
  );
  if (!answer) throw new Error("Gemini tidak mengembalikan jawaban.");
  return { provider: "gemini", model, answer };
}

async function callMistral(payload: ChatPayload): Promise<AiProviderResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY belum tersedia.");

  const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(payload) },
      ],
    }),
  });

  const data = (await parseJsonResponse(response)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Mistral request gagal.");
  }

  const answer = cleanAssistantAnswer(data.choices?.[0]?.message?.content?.trim() ?? "");
  if (!answer) throw new Error("Mistral tidak mengembalikan jawaban.");
  return { provider: "mistral", model, answer };
}

export async function answerWithAiProviders(payload: ChatPayload): Promise<AiProviderResult & { attempts: string[] }> {
  const attempts: string[] = [];
  const providers = [callGroq, callGemini, callMistral];

  for (const provider of providers) {
    try {
      const result = await provider(payload);
      return { ...result, attempts };
    } catch (error) {
      attempts.push(error instanceof Error ? error.message : "Provider gagal.");
    }
  }

  throw new Error(`Semua provider AI gagal: ${attempts.join(" | ")}`);
}
