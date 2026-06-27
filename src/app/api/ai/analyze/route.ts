import { z } from "zod";

export const runtime = "nodejs";

type AnalyzeProvider = "gemini" | "groq" | "openrouter" | "cohere" | "mistral";

type AnalyzeResult = {
  provider: AnalyzeProvider;
  model: string;
  data: AnalyzeResponse;
};

const PROVIDER_TIMEOUT_MS = 25_000;
const MAX_ATTEMPT_ERROR_LENGTH = 700;

const productIdSchema = z.union([z.string(), z.number(), z.null()]);

const analyzeResponseSchema = z
  .object({
    summary: z
      .object({
        total_products: z.number(),
        fast_moving_count: z.number(),
        low_moving_count: z.number(),
        critical_stock_count: z.number(),
      })
      .passthrough(),
    purchase_orders: z.array(
      z
        .object({
          product_id: productIdSchema,
          product_name: z.string(),
          recommended_qty: z.number(),
          priority: z.enum(["high", "medium", "low"]),
          reason: z.string(),
        })
        .passthrough(),
    ),
    inventory_control: z.array(
      z
        .object({
          product_id: productIdSchema,
          product_name: z.string(),
          current_stock: z.union([z.number(), z.null()]),
          recommended_action: z.string(),
          risk_level: z.enum(["high", "medium", "low"]),
        })
        .passthrough(),
    ),
    product_classification: z.array(
      z
        .object({
          product_id: productIdSchema,
          product_name: z.string(),
          classification: z.enum(["fast_moving", "low_moving"]),
          reason: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

const systemInstruction = [
  "Kamu adalah analis inventory pintar Artha System.",
  "Tugasmu memetakan kebutuhan Purchase Order (PO), mengontrol inventory, dan mengklasifikasikan produk.",
  "Klasifikasikan produk hanya dengan label 'fast_moving' atau 'low_moving'.",
  "Gunakan data produk, stok, dan penjualan dari dataContext yang diberikan.",
  "Jangan mengarang data di luar dataContext.",
  "Kembalikan JSON murni saja, tanpa markdown, tanpa code fence, tanpa penjelasan tambahan.",
  "Format JSON wajib memiliki struktur:",
  "{",
  '  "summary": { "total_products": number, "fast_moving_count": number, "low_moving_count": number, "critical_stock_count": number },',
  '  "purchase_orders": [{ "product_id": string | number | null, "product_name": string, "recommended_qty": number, "priority": "high" | "medium" | "low", "reason": string }],',
  '  "inventory_control": [{ "product_id": string | number | null, "product_name": string, "current_stock": number | null, "recommended_action": string, "risk_level": "high" | "medium" | "low" }],',
  '  "product_classification": [{ "product_id": string | number | null, "product_name": string, "classification": "fast_moving" | "low_moving", "reason": string }]',
  "}",
].join("\n");

function sanitizeError(message: string): string {
  const sanitized = message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1<redacted>")
    .replace(/(key=)[^&\s]+/gi, "$1<redacted>")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.length > MAX_ATTEMPT_ERROR_LENGTH
    ? `${sanitized.slice(0, MAX_ATTEMPT_ERROR_LENGTH)}...`
    : sanitized;
}

async function fetchWithTimeout(
  provider: AnalyzeProvider,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${provider} analyze timeout setelah ${PROVIDER_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function normalizeJsonText(value: string): string {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const objectStart = withoutFence.indexOf("{");
  const arrayStart = withoutFence.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (startCandidates.length === 0) return withoutFence;
  const start = Math.min(...startCandidates);
  const objectEnd = withoutFence.lastIndexOf("}");
  const arrayEnd = withoutFence.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  return end > start ? withoutFence.slice(start, end + 1) : withoutFence.slice(start);
}

function parsePureJson(answer: string): AnalyzeResponse {
  return analyzeResponseSchema.parse(JSON.parse(normalizeJsonText(answer)));
}

function buildUserPrompt(dataContext: unknown[]): string {
  return [
    "Analisis dataContext berikut untuk kebutuhan PO, kontrol inventory, dan klasifikasi fast_moving/low_moving.",
    "Balas hanya JSON murni sesuai systemInstruction.",
    "",
    JSON.stringify({ dataContext }),
  ].join("\n");
}

async function callGemini(dataContext: unknown[]): Promise<AnalyzeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY belum tersedia.");

  const model = "gemini-2.5-flash";
  const response = await fetchWithTimeout(
    "gemini",
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt(dataContext) }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const json = (await parseJsonResponse(response)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(json.error?.message || "Gemini analyze gagal.");

  const answer = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!answer) throw new Error("Gemini tidak mengembalikan JSON.");
  return { provider: "gemini", model, data: parsePureJson(answer) };
}

async function callGroq(dataContext: unknown[]): Promise<AnalyzeResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY belum tersedia.");

  const model = "llama3-8b-8192";
  const response = await fetchWithTimeout("groq", "https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1600,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: buildUserPrompt(dataContext) },
      ],
    }),
  });

  const json = (await parseJsonResponse(response)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : json.error?.message || "Groq analyze gagal.");
  }

  const answer = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) throw new Error("Groq tidak mengembalikan JSON.");
  return { provider: "groq", model, data: parsePureJson(answer) };
}

async function callOpenRouter(dataContext: unknown[]): Promise<AnalyzeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENROUTHER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum tersedia.");

  const model = "meta-llama/llama-3-8b-instruct:free";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-OpenRouter-Title": process.env.OPENROUTER_APP_TITLE || "Artha System",
  };
  if (process.env.OPENROUTER_SITE_URL) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }

  const response = await fetchWithTimeout("openrouter", "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1600,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: buildUserPrompt(dataContext) },
      ],
    }),
  });

  const json = (await parseJsonResponse(response)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : json.error?.message || "OpenRouter analyze gagal.");
  }

  const answer = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) throw new Error("OpenRouter tidak mengembalikan JSON.");
  return { provider: "openrouter", model, data: parsePureJson(answer) };
}

async function callCohere(dataContext: unknown[]): Promise<AnalyzeResult> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error("COHERE_API_KEY belum tersedia.");

  const model = "command-r";
  const response = await fetchWithTimeout("cohere", "https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Client-Name": process.env.COHERE_CLIENT_NAME || "artha-system",
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.1,
      max_tokens: 1600,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: buildUserPrompt(dataContext) },
      ],
    }),
  });

  const json = (await parseJsonResponse(response)) as {
    message?: { content?: { type?: string; text?: string }[] };
    error?: { message?: string } | string;
    message_text?: string;
  };
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : json.error?.message || "Cohere analyze gagal.");
  }

  const answer =
    json.message?.content
      ?.map((part) => (part.type === "text" || !part.type ? part.text ?? "" : ""))
      .join("")
      .trim() ??
    json.message_text ??
    "";
  if (!answer) throw new Error("Cohere tidak mengembalikan JSON.");
  return { provider: "cohere", model, data: parsePureJson(answer) };
}

async function callMistral(dataContext: unknown[]): Promise<AnalyzeResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY belum tersedia.");

  const model = "open-mixtral-8x22b";
  const response = await fetchWithTimeout("mistral", "https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1600,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: buildUserPrompt(dataContext) },
      ],
    }),
  });

  const json = (await parseJsonResponse(response)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string } | string;
  };
  if (!response.ok) {
    throw new Error(typeof json.error === "string" ? json.error : json.error?.message || "Mistral analyze gagal.");
  }

  const answer = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) throw new Error("Mistral tidak mengembalikan JSON.");
  return { provider: "mistral", model, data: parsePureJson(answer) };
}

export async function POST(request: Request) {
  let dataContext: unknown;

  try {
    const body = (await request.json()) as { dataContext?: unknown };
    dataContext = body.dataContext;
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_JSON_BODY",
          message: "Body request harus berupa JSON valid dengan format { dataContext: any[] }.",
        },
      },
      { status: 400 },
    );
  }

  if (!Array.isArray(dataContext)) {
    return Response.json(
      {
        error: {
          code: "INVALID_DATA_CONTEXT",
          message: "Field dataContext wajib berupa array.",
        },
      },
      { status: 400 },
    );
  }

  const attempts: { provider: AnalyzeProvider; model: string; error: string }[] = [];
  const providers: Array<{
    provider: AnalyzeProvider;
    model: string;
    run: (rows: unknown[]) => Promise<AnalyzeResult>;
  }> = [
    { provider: "gemini", model: "gemini-2.5-flash", run: callGemini },
    { provider: "groq", model: "llama3-8b-8192", run: callGroq },
    { provider: "openrouter", model: "meta-llama/llama-3-8b-instruct:free", run: callOpenRouter },
    { provider: "cohere", model: "command-r", run: callCohere },
    { provider: "mistral", model: "open-mixtral-8x22b", run: callMistral },
  ];

  for (const provider of providers) {
    try {
      const result = await provider.run(dataContext);
      return Response.json({
        success: true,
        provider: result.provider,
        model: result.model,
        result: result.data,
        ...result.data,
      });
    } catch (error) {
      attempts.push({
        provider: provider.provider,
        model: provider.model,
        error: sanitizeError(error instanceof Error ? error.message : "Provider analyze gagal."),
      });
    }
  }

  return Response.json(
    {
      error: {
        code: "AI_DAILY_LIMIT_EXHAUSTED",
        message: "Semua limit AI harian habis atau semua provider gagal dipakai untuk analisis inventory.",
        attempts,
      },
    },
    { status: 429 },
  );
}
