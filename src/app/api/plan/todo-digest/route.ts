import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import {
  getTodoDigestForUser,
  getUserProfile,
  isDatabaseConfigured,
  listArticlesForUser,
  recordTokenUsage,
  saveTodoDigestForUser,
} from "@/lib/db";
import { generateTodoDigest } from "@/lib/ai-todo-digest";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ text: "", updatedAt: null, disabled: true });
  }
  const row = await getTodoDigestForUser(session.id);
  return NextResponse.json({ text: row.text, updatedAt: row.updatedAt });
}

export async function POST(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  let extraRequirement = "";
  try {
    const raw: unknown = await req.json().catch(() => null);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const er = (raw as { extraRequirement?: unknown }).extraRequirement;
      if (typeof er === "string") extraRequirement = er.trim().slice(0, 800);
    }
  } catch {
    /* 空 body 视为无附加要求 */
  }

  const profile = await getUserProfile(session.id);
  if (!profile) {
    return NextResponse.json({ error: "profile_missing" }, { status: 400 });
  }

  const all = await listArticlesForUser(session.id);
  const todos = all.filter((a) => a.status === "todo");

  if (todos.length === 0) {
    const fallback = "当前没有待读条目，无需生成摘要。";
    await saveTodoDigestForUser(session.id, fallback);
    const row = await getTodoDigestForUser(session.id);
    return NextResponse.json({ text: row.text, updatedAt: row.updatedAt, ai: false });
  }

  const stored = await getTodoDigestForUser(session.id);
  const prevText = (stored.text ?? "").trim();
  const lastAtMs = stored.updatedAt ? new Date(stored.updatedAt).getTime() : 0;
  const hasPriorDigest = prevText.length > 0 && Number.isFinite(lastAtMs) && lastAtMs > 0;
  const hasExtra = extraRequirement.length > 0;

  let mode: "full" | "incremental";
  let todosForAi: typeof todos;
  let oneTime: string | undefined;
  let previousDigest: string | undefined;

  if (hasExtra) {
    mode = "full";
    todosForAi = todos;
    oneTime = extraRequirement;
  } else if (!hasPriorDigest) {
    mode = "full";
    todosForAi = todos;
  } else {
    const newTodos = todos.filter((a) => {
      const t = new Date(a.addedAt).getTime();
      return Number.isFinite(t) && t > lastAtMs;
    });
    if (newTodos.length === 0) {
      return NextResponse.json({
        text: prevText,
        updatedAt: stored.updatedAt,
        ai: false,
        skipped: true as const,
        reason: "no_new_todos",
      });
    }
    mode = "incremental";
    todosForAi = newTodos;
    previousDigest = prevText;
  }

  const ai = await generateTodoDigest({
    readingRole: profile.readingRole,
    readingDuties: profile.readingDuties,
    readingGoal: profile.readingGoal,
    readingPromptExtra: profile.readingPromptExtra,
    todos: todosForAi,
    mode,
    oneTimeExtra: oneTime,
    previousDigest,
  });

  if (ai?.text) {
    await saveTodoDigestForUser(session.id, ai.text);
    if (ai.usage && ai.usage.totalTokens > 0) {
      void recordTokenUsage({
        userId: session.id,
        source: "todo_digest",
        promptTokens: ai.usage.promptTokens,
        completionTokens: ai.usage.completionTokens,
        totalTokens: ai.usage.totalTokens,
      });
    }
    const row = await getTodoDigestForUser(session.id);
    return NextResponse.json({ text: row.text, updatedAt: row.updatedAt, ai: true, mode });
  }

  const fb =
    "暂时无法调用 AI 生成摘要（请检查 AI 密钥配置），或待读条目信息过少。你可稍后点击「刷新摘要」重试。";
  await saveTodoDigestForUser(session.id, fb.slice(0, 300));
  const row = await getTodoDigestForUser(session.id);
  return NextResponse.json({ text: row.text, updatedAt: row.updatedAt, ai: false });
}
