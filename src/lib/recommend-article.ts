import { randomUUID } from "node:crypto";
import type { Article } from "@/lib/types";
import { todayIso, shiftDays } from "@/lib/plan";
import {
  insertArticle,
  insertRecommendationMeta,
  resolveRecommenderThemePrefix,
  verifyMutualFollows,
} from "@/lib/db";
import { duplicateArticleMessage, findExistingArticleByUrl } from "@/lib/article-duplicate";

export async function recommendMyArticleToUser(params: {
  fromUserId: string;
  toUserId: string;
  source: Article;
}): Promise<{ ok: true; targetArticleId: string } | { ok: false; error: string }> {
  const { fromUserId, toUserId, source } = params;
  if (fromUserId.trim() === toUserId.trim()) return { ok: false, error: "不能推荐给自己" };
  const okMutual = await verifyMutualFollows(fromUserId, toUserId);
  if (!okMutual) return { ok: false, error: "仅互相关注的用户之间可使用推荐；请让对方关注你或先回关对方。" };
  const existing = await findExistingArticleByUrl(toUserId, source.url);
  if (existing) return { ok: false, error: duplicateArticleMessage(existing).replace(/^该链接/, "对方书库中该链接") };
  const prefix = await resolveRecommenderThemePrefix(fromUserId, toUserId);
  const theme = `${prefix}推荐`;
  const due = shiftDays(todayIso(), 2);
  const copy: Article = {
    ...source,
    id: randomUUID(),
    theme,
    status: "todo",
    dueDate: due,
    addedAt: new Date().toISOString(),
    completedAt: null,
    readOneLiner: "",
    readKeyPoints: ["", "", ""],
    readAction: "",
  };
  await insertArticle(copy, toUserId);
  await insertRecommendationMeta(fromUserId, toUserId, copy.id);
  return { ok: true, targetArticleId: copy.id };
}
