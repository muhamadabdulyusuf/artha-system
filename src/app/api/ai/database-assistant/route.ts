import { SESSION_COOKIE, parseStaffSessionCookie } from "@/lib/auth/sessionCookie";
import { buildDatabaseAssistantContext } from "@/lib/ai/databaseContext";
import { answerFromDatabaseContext } from "@/lib/ai/localAnswer";
import { answerWithAiProviders } from "@/lib/ai/providers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
      | Awaited<ReturnType<typeof answerWithAiProviders>>
      | { answer: string; provider: "artha-local"; model: "database-context"; attempts: string[] };

    const localAnswer = answerFromDatabaseContext(question, context);
    if (localAnswer) {
      aiResult = {
        answer: localAnswer,
        provider: "artha-local",
        model: "database-context",
        attempts: [],
      };
    } else {
      try {
        aiResult = await answerWithAiProviders({ question, context, history });
      } catch (providerError) {
        const fallbackAnswer = answerFromDatabaseContext(question, context);
        if (!fallbackAnswer) throw providerError;
        aiResult = {
          answer: fallbackAnswer,
          provider: "artha-local",
          model: "database-context",
          attempts: [providerError instanceof Error ? providerError.message : "Provider AI gagal."],
        };
      }
    }

    return Response.json({
      answer: aiResult.answer,
      provider: aiResult.provider,
      model: aiResult.model,
      attempts: aiResult.attempts,
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
