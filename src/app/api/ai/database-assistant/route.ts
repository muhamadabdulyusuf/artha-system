import { SESSION_COOKIE, parseStaffSessionCookie } from "@/lib/auth/sessionCookie";
import { buildDatabaseAssistantContext, type DatabaseAssistantContext } from "@/lib/ai/databaseContext";
import { answerFromDatabaseContext, type LocalAnswerResult } from "@/lib/ai/localAnswer";
import { answerWithAiProviders } from "@/lib/ai/providers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AiQuality = Pick<LocalAnswerResult, "confidence" | "sources" | "actionHints">;

function inferProviderQuality(context: DatabaseAssistantContext): AiQuality {
  const sources = new Set<string>();
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

export async function POST(request: Request) {
  const session = parseStaffSessionCookie(readCookie(request, SESSION_COOKIE));
  if (!session) {
    return Response.json({ error: "Sesi tidak valid." }, { status: 401 });
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

  try {
    const supabase = getSupabaseServerClient();
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
