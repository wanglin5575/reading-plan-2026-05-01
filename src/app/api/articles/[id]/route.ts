import { NextResponse } from "next/server";
import { deleteArticle, getArticle, updateArticle } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const article = getArticle(id);
  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { status?: "todo" | "done"; dueDate?: string; theme?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.status) {
    article.status = body.status;
    article.completedAt = body.status === "done" ? new Date().toISOString() : null;
  }
  if (body.dueDate) article.dueDate = body.dueDate;
  if (body.theme) article.theme = body.theme;

  updateArticle(article);
  return NextResponse.json({ article });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteArticle(id);
  return NextResponse.json({ ok: true });
}
