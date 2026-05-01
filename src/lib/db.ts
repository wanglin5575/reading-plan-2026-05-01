import { Pool } from "pg";
import type { Article } from "./types";

function getConnectionString(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    null
  );
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error(
      "Missing database connection string. Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL / SUPABASE_DB_URL).",
    );
  }
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          domain TEXT NOT NULL,
          theme TEXT NOT NULL,
          summary TEXT NOT NULL,
          language TEXT NOT NULL,
          char_count INTEGER NOT NULL,
          word_count INTEGER NOT NULL,
          estimated_minutes INTEGER NOT NULL,
          recommended_depth TEXT NOT NULL,
          knowledge_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL,
          added_at TIMESTAMPTZ NOT NULL,
          due_date DATE NOT NULL,
          completed_at TIMESTAMPTZ,
          raw_excerpt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_articles_due_date ON articles(due_date);
        CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
        CREATE INDEX IF NOT EXISTS idx_articles_completed_at ON articles(completed_at);
      `);
    })();
  }
  return schemaReady;
}

interface ArticleRow {
  id: string;
  url: string;
  title: string;
  domain: string;
  theme: string;
  summary: string;
  language: string;
  char_count: number;
  word_count: number;
  estimated_minutes: number;
  recommended_depth: string;
  knowledge_tags: string[] | string;
  status: string;
  added_at: Date | string;
  due_date: string;
  completed_at: Date | string | null;
  raw_excerpt: string;
}

function rowToArticle(row: ArticleRow): Article {
  const tags =
    typeof row.knowledge_tags === "string" ? JSON.parse(row.knowledge_tags || "[]") : row.knowledge_tags;

  const addedAtIso = row.added_at instanceof Date ? row.added_at.toISOString() : row.added_at;
  const completedAtIso =
    row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at;

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    domain: row.domain,
    theme: row.theme,
    summary: row.summary,
    language: row.language as Article["language"],
    charCount: row.char_count,
    wordCount: row.word_count,
    estimatedMinutes: row.estimated_minutes,
    recommendedDepth: row.recommended_depth as Article["recommendedDepth"],
    knowledgeTags: tags || [],
    status: row.status as Article["status"],
    addedAt: addedAtIso,
    dueDate: row.due_date,
    completedAt: completedAtIso,
    rawExcerpt: row.raw_excerpt,
  };
}

export async function insertArticle(article: Article): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO articles (
      id, url, title, domain, theme, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date,
      completed_at, raw_excerpt
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12::jsonb, $13, $14::timestamptz, $15::date,
      $16::timestamptz, $17
    )`,
    [
      article.id,
      article.url,
      article.title,
      article.domain,
      article.theme,
      article.summary,
      article.language,
      article.charCount,
      article.wordCount,
      article.estimatedMinutes,
      article.recommendedDepth,
      JSON.stringify(article.knowledgeTags),
      article.status,
      article.addedAt,
      article.dueDate,
      article.completedAt,
      article.rawExcerpt,
    ],
  );
}

export async function updateArticle(article: Article): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `UPDATE articles SET
      title = $1,
      theme = $2,
      summary = $3,
      language = $4,
      char_count = $5,
      word_count = $6,
      estimated_minutes = $7,
      recommended_depth = $8,
      knowledge_tags = $9::jsonb,
      status = $10,
      due_date = $11::date,
      completed_at = $12::timestamptz,
      raw_excerpt = $13
    WHERE id = $14`,
    [
      article.title,
      article.theme,
      article.summary,
      article.language,
      article.charCount,
      article.wordCount,
      article.estimatedMinutes,
      article.recommendedDepth,
      JSON.stringify(article.knowledgeTags),
      article.status,
      article.dueDate,
      article.completedAt,
      article.rawExcerpt,
      article.id,
    ],
  );
}

export async function listArticles(): Promise<Article[]> {
  try {
    await ensureSchema();
    const { rows } = await getPool().query<ArticleRow>("SELECT * FROM articles ORDER BY due_date ASC, added_at DESC");
    return rows.map(rowToArticle);
  } catch (error) {
    console.error("[db] listArticles failed:", error);
    return [];
  }
}

export async function getArticle(id: string): Promise<Article | null> {
  try {
    await ensureSchema();
    const { rows } = await getPool().query<ArticleRow>("SELECT * FROM articles WHERE id = $1 LIMIT 1", [id]);
    const row = rows[0];
    return row ? rowToArticle(row) : null;
  } catch (error) {
    console.error("[db] getArticle failed:", error);
    return null;
  }
}

export async function deleteArticle(id: string): Promise<void> {
  await ensureSchema();
  await getPool().query("DELETE FROM articles WHERE id = $1", [id]);
}

export async function listCompletedBetween(startIso: string, endIso: string): Promise<Article[]> {
  try {
    await ensureSchema();
    const { rows } = await getPool().query<ArticleRow>(
      "SELECT * FROM articles WHERE status = 'done' AND completed_at >= $1 AND completed_at < $2 ORDER BY completed_at DESC",
      [startIso, endIso],
    );
    return rows.map(rowToArticle);
  } catch (error) {
    console.error("[db] listCompletedBetween failed:", error);
    return [];
  }
}
