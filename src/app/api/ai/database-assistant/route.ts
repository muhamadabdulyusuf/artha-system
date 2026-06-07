import { SESSION_COOKIE, parseStaffSessionCookie } from "@/lib/auth/sessionCookie";
import { canAccessAdminRoute } from "@/lib/auth/routeAccess";
import { buildDatabaseAssistantContext } from "@/lib/ai/databaseContext";
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
  if (!canAccessAdminRoute(session?.role)) {
    return Response.json({ error: "Sesi admin tidak valid." }, { status: 401 });
  }

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = String(body.question ?? "").trim();
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
    const aiResult = await answerWithAiProviders({ question, context });

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
