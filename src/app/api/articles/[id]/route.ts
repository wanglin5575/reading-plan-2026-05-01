import { NextResponse } from "next/server";
import { deleteArticle, getArticle, updateArticle } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const article = await getArticle(id);
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

  try {
    await updateArticle(article);
    return NextResponse.json({ article });
  } catch (error) {
    if (error instanceof Error && error.message === "db_not_configured") {
      return NextResponse.json(
        { error: "db_not_configured", message: "请先在 Vercel 设置 DATABASE_URL 后再修改文章。" },
        { status: 503 },
      );
    }
    throw error;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteArticle(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "db_not_configured") {
      return NextResponse.json(
        { error: "db_not_configured", message: "请先在 Vercel 设置 DATABASE_URL 后再删除文章。" },
        { status: 503 },
      );
    }
    throw error;
  }
}
