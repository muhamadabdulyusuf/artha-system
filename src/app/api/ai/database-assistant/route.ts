import { SESSION_COOKIE, parseStaffSessionCookie } from "@/lib/auth/sessionCookie";
import { buildDatabaseAssistantContext, type DatabaseAssistantContext } from "@/lib/ai/databaseContext";
import { answerFromDatabaseContext, type LocalAnswerResult } from "@/lib/ai/localAnswer";
import { answerWithAiProviders, getAiProviderStatuses } from "@/lib/ai/providers";
import { canUseAiAssistant } from "@/lib/auth/permissions";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AiQuality = Pick<LocalAnswerResult, "confidence" | "sources" | "actionHints">;

const MEMORY_STOP_WORDS = new Set([
  "yang",
  "dan",
  "atau",
  "untuk",
  "dengan",
  "bahwa",
  "catat",
  "ingat",
  "simpan",
  "tolong",
  "artha",
  "bisnis",
  "operasional",
]);

function inferProviderQuality(context: DatabaseAssistantContext): AiQuality {
  const sources = new Set<string>();
  const database = context.database as Record<string, unknown>;
  for (const intent of context.intents) {
    if (intent === "menu") {
      sources.add("menu_item");
      sources.add("menu_recipe_version aktif");
      sources.add("recipe_line");
    }
    if (intent === "stock") {
      sources.add("ingredient");
      sources.add("stock_ledger");
    }
    if (intent === "sales") {
      sources.add("worksheet_session 30 hari");
      sources.add("worksheet_sold_line");
    }
    if (intent === "po") sources.add("purchase_request_tracker");
    if (intent === "supplier") sources.add("supplier");
    if (intent === "issue") sources.add("worksheet_menu_issue_line");
    if (intent === "event") sources.add("demand_event");
  }
  if (Array.isArray(database.matchedBusinessMemories) && database.matchedBusinessMemories.length > 0) {
    sources.add("ai_business_memory");
  }

  return {
    confidence: "medium",
    sources: Array.from(sources).slice(0, 6),
    actionHints: ["Validasi angka penting di dashboard", "Tanya follow-up dengan nama menu/bahan persis"],
  };
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : undefined;
}

function extractMemoryContent(question: string): string | null {
  const cleanQuestion = question.trim();
  const patterns = [
    /^(?:tolong\s+)?(?:artha\s+)?(?:catat|ingat|simpan|remember)\s*(?:bahwa|:|-)?\s+(.+)$/i,
    /^(?:tolong\s+)?(?:catatin|ingetin)\s*(?:bahwa|:|-)?\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleanQuestion.match(pattern);
    const content = match?.[1]?.trim();
    if (content && content.length >= 3) return content.slice(0, 1200);
  }

  return null;
}

function extractMemoryTags(content: string): string[] {
  return Array.from(
    new Set(
      content
        .toLowerCase()
        .replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !MEMORY_STOP_WORDS.has(term)),
    ),
  ).slice(0, 10);
}

function inferMemoryDepartment(content: string): "bar" | "kitchen" | null {
  const normalized = content.toLowerCase();
  if (/\bbar\b/.test(normalized)) return "bar";
  if (/\bkitchen\b|dapur/.test(normalized)) return "kitchen";
  return null;
}

function buildMemoryTitle(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 72);
}

function isProviderStatusQuestion(question: string): boolean {
  return /provider|engine|api\s*key|key\s*ai|ai.*(aktif|provider|engine|model)|model.*ai|aktif.*ai|fallback/i.test(
    question,
  );
}

function answerProviderStatus(): {
  answer: string;
  quality: AiQuality;
} {
  const statuses = getAiProviderStatuses();
  const configuredCount = statuses.filter((status) => status.configured).length;
  const lines = statuses.map((status) => {
    const state = status.configured ? "siap" : `belum ada ${status.keyEnv}`;
    return `- ${status.order}. ${status.provider}: ${state}, model ${status.model}.`;
  });

  return {
    answer: [`Status AI engine: ${configuredCount}/${statuses.length} provider siap.`, "", ...lines].join("\n"),
    quality: {
      confidence: "high",
      sources: ["server environment", "AI_PROVIDER_ORDER"],
      actionHints: ["Cek deployment secrets", "Rotate key yang pernah kebuka", "Atur AI_PROVIDER_ORDER kalau perlu"],
    },
  };
}

export async function GET(request: Request) {
  const session = parseStaffSessionCookie(readCookie(request, SESSION_COOKIE));
  if (!session) {
    return Response.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  if (!canUseAiAssistant(session.role)) {
    return Response.json({ error: "AI assistant hanya tersedia untuk admin dan op manager." }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const context = await buildDatabaseAssistantContext(supabase, "briefing operasi hari ini");

    return Response.json({
      context: {
        businessDate: context.businessDate,
        counts: context.database.counts,
        operationsSummary: context.database.operationsSummary,
        businessMemories: context.database.businessMemories,
        aiProviders: getAiProviderStatuses(),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "AI briefing gagal.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = parseStaffSessionCookie(readCookie(request, SESSION_COOKIE));
  if (!session) {
    return Response.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  if (!canUseAiAssistant(session.role)) {
    return Response.json({ error: "Hanya admin/op manager yang bisa archive memori AI." }, { status: 403 });
  }

  let memoryId = "";
  try {
    const body = (await request.json()) as { memoryId?: unknown };
    memoryId = String(body.memoryId ?? "").trim();
  } catch {
    return Response.json({ error: "Payload archive memori tidak valid." }, { status: 400 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memoryId)) {
    return Response.json({ error: "ID memori tidak valid." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("ai_business_memory")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", memoryId)
      .is("archived_at", null);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Archive memori AI gagal.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = parseStaffSessionCookie(readCookie(request, SESSION_COOKIE));
  if (!session) {
    return Response.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  if (!canUseAiAssistant(session.role)) {
    return Response.json({ error: "AI assistant hanya tersedia untuk admin dan op manager." }, { status: 403 });
  }

  let question = "";
  let history: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const body = (await request.json()) as {
      question?: unknown;
      history?: unknown;
    };
    question = String(body.question ?? "").trim();
    history = Array.isArray(body.history)
      ? body.history
          .map((message) => {
            const candidate = message as { role?: unknown; content?: unknown };
            const role = candidate.role === "assistant" ? "assistant" : "user";
            const content = String(candidate.content ?? "").trim().slice(0, 900);
            return content ? { role, content } : null;
          })
          .filter((message): message is { role: "user" | "assistant"; content: string } => message !== null)
          .slice(-6)
      : [];
  } catch {
    return Response.json({ error: "Payload AI tidak valid." }, { status: 400 });
  }

  if (question.length < 3) {
    return Response.json({ error: "Pertanyaan terlalu pendek." }, { status: 400 });
  }

  if (question.length > 1200) {
    return Response.json({ error: "Pertanyaan terlalu panjang." }, { status: 400 });
  }

  if (isProviderStatusQuestion(question)) {
    const providerStatus = answerProviderStatus();

    return Response.json({
      answer: providerStatus.answer,
      provider: "artha-local",
      model: "provider-health",
      attempts: [],
      quality: providerStatus.quality,
      context: {
        businessDate: new Date().toISOString().slice(0, 10),
        intents: ["event"],
        searchTerms: [],
        counts: {},
        aiProviders: getAiProviderStatuses(),
      },
    });
  }

  try {
    const supabase = getSupabaseServerClient();
    const memoryContent = extractMemoryContent(question);

    if (memoryContent) {
      const { error: memoryError } = await supabase.from("ai_business_memory").insert({
        title: buildMemoryTitle(memoryContent),
        content: memoryContent,
        tags: extractMemoryTags(memoryContent),
        department: inferMemoryDepartment(memoryContent),
        importance: 3,
        source: "assistant",
        created_by_staff_id: session.id,
      });

      if (memoryError) {
        return Response.json(
          {
            error: `Memori AI belum bisa disimpan: ${memoryError.message}`,
          },
          { status: 500 },
        );
      }

      const context = await buildDatabaseAssistantContext(supabase, memoryContent);

      return Response.json({
        answer: `Udah gue catat: ${memoryContent}`,
        provider: "artha-local",
        model: "business-memory",
        attempts: [],
        quality: {
          confidence: "high",
          sources: ["ai_business_memory"],
          actionHints: ["Tanya lagi pakai kata kunci yang sama", "Cek catatan dengan pertanyaan: apa yang kamu ingat?"],
        },
        context: {
          businessDate: context.businessDate,
          intents: context.intents,
          searchTerms: context.searchTerms,
          counts: context.database.counts,
          aiProviders: getAiProviderStatuses(),
        },
      });
    }

    const context = await buildDatabaseAssistantContext(supabase, question);
    let aiResult:
      | (Awaited<ReturnType<typeof answerWithAiProviders>> & { quality: AiQuality })
      | { answer: string; provider: "artha-local"; model: "database-context"; attempts: string[]; quality: AiQuality };

    const localAnswer = answerFromDatabaseContext(question, context);
    if (localAnswer) {
      aiResult = {
        answer: localAnswer.answer,
        provider: "artha-local",
        model: "database-context",
        attempts: [],
        quality: {
          confidence: localAnswer.confidence,
          sources: localAnswer.sources,
          actionHints: localAnswer.actionHints,
        },
      };
    } else {
      try {
        const providerAnswer = await answerWithAiProviders({ question, context, history });
        aiResult = {
          ...providerAnswer,
          quality: inferProviderQuality(context),
        };
      } catch (providerError) {
        const fallbackAnswer = answerFromDatabaseContext(question, context);
        if (!fallbackAnswer) throw providerError;
        aiResult = {
          answer: fallbackAnswer.answer,
          provider: "artha-local",
          model: "database-context",
          attempts: [providerError instanceof Error ? providerError.message : "Provider AI gagal."],
          quality: {
            confidence: fallbackAnswer.confidence,
            sources: fallbackAnswer.sources,
            actionHints: fallbackAnswer.actionHints,
          },
        };
      }
    }

    return Response.json({
      answer: aiResult.answer,
      provider: aiResult.provider,
      model: aiResult.model,
      attempts: aiResult.attempts,
      quality: aiResult.quality,
      context: {
        businessDate: context.businessDate,
        intents: context.intents,
        searchTerms: context.searchTerms,
        counts: context.database.counts,
        aiProviders: getAiProviderStatuses(),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "AI database assistant gagal.",
      },
      { status: 500 },
    );
  }
}
