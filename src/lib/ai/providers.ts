import type { DatabaseAssistantContext } from "@/lib/ai/databaseContext";

export type AiProviderName = "groq" | "gemini" | "openrouter" | "mistral" | "cohere";

export type AiProviderResult = {
  provider: AiProviderName;
  model: string;
  answer: string;
};

export type AiProviderStatus = {
  provider: AiProviderName;
  model: string;
  configured: boolean;
  keyEnv: string;
  order: number;
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
  "Gunakan database.operationsSummary untuk briefing, reorder, PO risk, menu movement, dan data quality warning.",
  "Gunakan database.matchedBusinessMemories dan database.businessMemories sebagai memori bisnis internal; jangan abaikan kalau relevan dengan pertanyaan.",
  "Kalau user bertanya apa yang kamu ingat, jawab dari ai_business_memory, bukan dari asumsi.",
  "Untuk pertanyaan bahan yang dipakai sebuah menu, gunakan database.menuRecipeMatches lebih dulu, lalu database.menuIngredientMatches.",
  "Untuk pertanyaan menu apa saja yang memakai bahan tertentu, hanya gunakan database.menuIngredientMatches; jangan ambil nama dari menuCatalog atau salesLast30Days.",
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

function sanitizeProviderError(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(key=)[^&\s]+/gi, "$1<redacted>");
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function getProviderModel(provider: AiProviderName): string {
  if (provider === "groq") return process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  if (provider === "gemini") return process.env.GEMINI_MODEL || "gemini-2.0-flash";
  if (provider === "openrouter") return process.env.OPENROUTER_MODEL || "openai/gpt-5.2";
  if (provider === "mistral") return process.env.MISTRAL_MODEL || "mistral-small-latest";
  return process.env.COHERE_MODEL || "command-a-plus-05-2026";
}

function getProviderKeyEnv(provider: AiProviderName): string {
  if (provider === "groq") return "GROQ_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  if (provider === "openrouter") {
    return hasEnv("OPENROUTER_API_KEY") ? "OPENROUTER_API_KEY" : "OPENROUTHER_API_KEY";
  }
  if (provider === "mistral") return "MISTRAL_API_KEY";
  return "COHERE_API_KEY";
}

function isProviderConfigured(provider: AiProviderName): boolean {
  if (provider === "openrouter") return hasEnv("OPENROUTER_API_KEY") || hasEnv("OPENROUTHER_API_KEY");
  return hasEnv(getProviderKeyEnv(provider));
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

async function callOpenRouter(payload: ChatPayload): Promise<AiProviderResult> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTHER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum tersedia.");

  const model = process.env.OPENROUTER_MODEL || "openai/gpt-5.2";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": process.env.OPENROUTER_APP_TITLE || "Artha System",
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
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
    throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "OpenRouter request gagal.");
  }

  const answer = cleanAssistantAnswer(data.choices?.[0]?.message?.content?.trim() ?? "");
  if (!answer) throw new Error("OpenRouter tidak mengembalikan jawaban.");
  return { provider: "openrouter", model, answer };
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

async function callCohere(payload: ChatPayload): Promise<AiProviderResult> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY belum tersedia.");

  const model = process.env.COHERE_MODEL || "command-a-plus-05-2026";
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Client-Name": process.env.COHERE_CLIENT_NAME || "artha-system",
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(payload) },
      ],
    }),
  });

  const data = (await parseJsonResponse(response)) as {
    message?: { content?: { type?: string; text?: string }[] };
    error?: { message?: string } | string;
    message_text?: string;
  };
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Cohere request gagal.");
  }

  const answer = cleanAssistantAnswer(
    data.message?.content
      ?.map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
      .join("")
      .trim() ??
      data.message_text ??
      "",
  );
  if (!answer) throw new Error("Cohere tidak mengembalikan jawaban.");
  return { provider: "cohere", model, answer };
}

const PROVIDER_BY_NAME: Record<AiProviderName, (payload: ChatPayload) => Promise<AiProviderResult>> = {
  groq: callGroq,
  gemini: callGemini,
  openrouter: callOpenRouter,
  mistral: callMistral,
  cohere: callCohere,
};

function resolveProviderNames(): AiProviderName[] {
  const configured = (process.env.AI_PROVIDER_ORDER || "groq,gemini,openrouter,mistral,cohere")
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  const orderedNames = configured.filter((provider): provider is AiProviderName => provider in PROVIDER_BY_NAME);
  const fallbackNames: AiProviderName[] = ["groq", "gemini", "openrouter", "mistral", "cohere"];
  return Array.from(new Set([...orderedNames, ...fallbackNames]));
}

function resolveProviderOrder(): ((payload: ChatPayload) => Promise<AiProviderResult>)[] {
  return resolveProviderNames().map((provider) => PROVIDER_BY_NAME[provider]);
}

export function getAiProviderStatuses(): AiProviderStatus[] {
  return resolveProviderNames().map((provider, index) => ({
    provider,
    model: getProviderModel(provider),
    configured: isProviderConfigured(provider),
    keyEnv: getProviderKeyEnv(provider),
    order: index + 1,
  }));
}

export async function answerWithAiProviders(payload: ChatPayload): Promise<AiProviderResult & { attempts: string[] }> {
  const attempts: string[] = [];
  const providers = resolveProviderOrder();

  for (const provider of providers) {
    try {
      const result = await provider(payload);
      return { ...result, attempts };
    } catch (error) {
      attempts.push(sanitizeProviderError(error instanceof Error ? error.message : "Provider gagal."));
    }
  }

  throw new Error(`Semua provider AI gagal: ${attempts.join(" | ")}`);
}
