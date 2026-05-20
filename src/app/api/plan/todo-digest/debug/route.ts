import { NextResponse } from "next/server";
import { getRouteHandlerUser } from "@/lib/auth/api";
import {
  getTodoDigestForUser,
  getUserProfile,
  isDatabaseConfigured,
  listArticlesForUser,
} from "@/lib/db";
import { buildTodoDigestMessages, TODO_DIGEST_MAX_CHARS } from "@/lib/ai-todo-digest";

export const dynamic = "force-dynamic";

/**
 * 还原最近一次待读摘要的「输出 + 推断的输入」供排查 case。
 * 需登录；原始 prompt 未落库，输入为按当前数据重建。
 */
export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const profile = await getUserProfile(session.id);
  if (!profile) {
    return NextResponse.json({ error: "profile_missing" }, { status: 400 });
  }

  const stored = await getTodoDigestForUser(session.id);
  const all = await listArticlesForUser(session.id);
  const todos = all.filter((a) => a.status === "todo");

  const digestAtMs = stored.updatedAt ? new Date(stored.updatedAt).getTime() : 0;
  const todosAtGen =
    digestAtMs > 0
      ? todos.filter((a) => {
          const t = new Date(a.addedAt).getTime();
          return !Number.isFinite(t) || t <= digestAtMs + 60_000;
        })
      : todos;

  const newSinceDigest =
    digestAtMs > 0
      ? todos.filter((a) => {
          const t = new Date(a.addedAt).getTime();
          return Number.isFinite(t) && t > digestAtMs;
        })
      : [];

  const incrementalTodos =
    digestAtMs > 0
      ? todosAtGen.filter((a) => {
          const t = new Date(a.addedAt).getTime();
          return Number.isFinite(t) && t > digestAtMs - 7 * 24 * 3600 * 1000;
        })
      : [];

  const purpose = {
    readingRole: profile.readingRole,
    readingDuties: profile.readingDuties,
    readingGoal: profile.readingGoal,
    readingPromptExtra: profile.readingPromptExtra,
  };

  const outputText = (stored.text ?? "").trim();

  return NextResponse.json({
    note: "storedOutput 为 DB 最终文本；reconstructedInput 为按 generateTodoDigest 逻辑还原，非 API 原始字节。请求 mode/force/extra 未持久化，请结合 token 日志判断。",
    meta: {
      todoDigestAt: stored.updatedAt,
      outputCharCount: Array.from(outputText).length,
      maxChars: TODO_DIGEST_MAX_CHARS,
      todoCountNow: todos.length,
      todoCountAtOrBeforeDigest: todosAtGen.length,
      todosAddedAfterDigest: newSinceDigest.length,
      outputTail120: outputText.slice(-120),
    },
    purpose,
    storedOutput: outputText,
    reconstructedInput: {
      full: buildTodoDigestMessages({
        ...purpose,
        todos: todosAtGen,
        mode: "full",
      }),
      incremental: buildTodoDigestMessages({
        ...purpose,
        todos: incrementalTodos,
        mode: "incremental",
        previousDigest: "（上一版摘要未单独存档；若当时为增量模式，prevBlock 为生成前的 todo_digest 全文）",
      }),
    },
  });
}
