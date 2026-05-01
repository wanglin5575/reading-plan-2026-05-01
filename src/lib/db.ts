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

function getPoolOrNull(): Pool | null {
  if (pool) return pool;
  const connectionString = getConnectionString();
  if (!connectionString) return null;
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  return pool;
}

async function ensureSchema(): Promise<void> {
  const p = getPoolOrNull();
  if (!p) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await p.query(`
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          author TEXT NOT NULL DEFAULT '未知作者',
          domain TEXT NOT NULL,
          theme TEXT NOT NULL,
          custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          featured BOOLEAN NOT NULL DEFAULT FALSE,
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
          read_one_liner TEXT NOT NULL DEFAULT '',
          read_key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
          read_action TEXT NOT NULL DEFAULT '',
          raw_excerpt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_articles_due_date ON articles(due_date);
        CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
        CREATE INDEX IF NOT EXISTS idx_articles_completed_at ON articles(completed_at);
      `);
      await p.query(`
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '未知作者';
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_one_liner TEXT NOT NULL DEFAULT '';
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_key_points JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_action TEXT NOT NULL DEFAULT '';
      `);
    })();
  }
  return schemaReady;
}

interface ArticleRow {
  id: string;
  url: string;
  title: string;
  author: string;
  domain: string;
  theme: string;
  custom_tags: string[] | string;
  featured: boolean;
  summary: string;
  language: string;
  char_count: number;
  word_count: number;
  estimated_minutes: number;
  recommended_depth: string;
  knowledge_tags: string[] | string;
  status: string;
  added_at: Date | string;
  due_date: string | Date;
  completed_at: Date | string | null;
  read_one_liner?: string | null;
  read_key_points?: string[] | string | null;
  read_action?: string | null;
  raw_excerpt: string;
}

/** JSONB / 历史脏数据容错：保证解析结果为数组或回退 [] */
function safeJsonArray(value: unknown): unknown {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value || "[]");
    } catch {
      return [];
    }
  }
  return [];
}

/** PG `date` 在部分驱动/连接下会变为 JS Date，统一为 YYYY-MM-DD 供 localeCompare / input[type=date] 使用 */
function normalizeDueDateIso(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function rowToArticle(row: ArticleRow): Article {
  const rawKt = safeJsonArray(row.knowledge_tags);
  const rawCt = safeJsonArray(row.custom_tags);
  const knowledgeTags: string[] = Array.isArray(rawKt) ? rawKt.map(String) : [];
  const customTags: string[] = Array.isArray(rawCt) ? rawCt.map(String) : [];
  const readKeyPointsRaw =
    row.read_key_points === undefined || row.read_key_points === null
      ? []
      : typeof row.read_key_points === "string"
        ? safeJsonArray(row.read_key_points)
        : row.read_key_points;
  const readKeyPoints: string[] = Array.isArray(readKeyPointsRaw) ? readKeyPointsRaw.map(String) : [];
  const addedAtIso = row.added_at instanceof Date ? row.added_at.toISOString() : row.added_at;
  const completedAtIso = row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at;

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    author: row.author || "未知作者",
    domain: row.domain,
    theme: row.theme,
    customTags,
    featured: Boolean(row.featured),
    summary: row.summary,
    language: row.language as Article["language"],
    charCount: row.char_count,
    wordCount: row.word_count,
    estimatedMinutes: row.estimated_minutes,
    recommendedDepth: row.recommended_depth as Article["recommendedDepth"],
    knowledgeTags,
    status: row.status as Article["status"],
    addedAt: addedAtIso,
    dueDate: normalizeDueDateIso(row.due_date),
    completedAt: completedAtIso,
    readOneLiner: row.read_one_liner ?? "",
    readKeyPoints,
    readAction: row.read_action ?? "",
    rawExcerpt: row.raw_excerpt,
  };
}

export async function insertArticle(article: Article): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  await p.query(
    `INSERT INTO articles (
      id, url, title, author, domain, theme, custom_tags, featured, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date, completed_at,
      read_one_liner, read_key_points, read_action, raw_excerpt
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23
    )`,
    [
      article.id,
      article.url,
      article.title,
      article.author || "未知作者",
      article.domain,
      article.theme,
      JSON.stringify(article.customTags || []),
      article.featured,
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
      article.readOneLiner || "",
      JSON.stringify(article.readKeyPoints || []),
      article.readAction || "",
      article.rawExcerpt,
    ],
  );
}

export async function updateArticle(article: Article): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  await p.query(
    `UPDATE articles SET
      title = $1,
      author = $2,
      theme = $3,
      custom_tags = $4::jsonb,
      featured = $5,
      summary = $6,
      language = $7,
      char_count = $8,
      word_count = $9,
      estimated_minutes = $10,
      recommended_depth = $11,
      knowledge_tags = $12::jsonb,
      status = $13,
      due_date = $14::date,
      completed_at = $15::timestamptz,
      read_one_liner = $16,
      read_key_points = $17::jsonb,
      read_action = $18,
      raw_excerpt = $19
    WHERE id = $20`,
    [
      article.title,
      article.author || "未知作者",
      article.theme,
      JSON.stringify(article.customTags || []),
      article.featured,
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
      article.readOneLiner || "",
      JSON.stringify(article.readKeyPoints || []),
      article.readAction || "",
      article.rawExcerpt,
      article.id,
    ],
  );
}

export async function listArticles(): Promise<Article[]> {
  try {
    const p = getPoolOrNull();
    if (!p) return [];
    await ensureSchema();
    const { rows } = await p.query<ArticleRow>("SELECT * FROM articles ORDER BY due_date ASC, added_at DESC");
    return rows.map(rowToArticle);
  } catch (error) {
    console.error("[db] listArticles failed:", error);
    return [];
  }
}

export async function getArticle(id: string): Promise<Article | null> {
  try {
    const p = getPoolOrNull();
    if (!p) return null;
    await ensureSchema();
    const { rows } = await p.query<ArticleRow>("SELECT * FROM articles WHERE id = $1 LIMIT 1", [id]);
    const row = rows[0];
    return row ? rowToArticle(row) : null;
  } catch (error) {
    console.error("[db] getArticle failed:", error);
    return null;
  }
}

export async function deleteArticle(id: string): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  await p.query("DELETE FROM articles WHERE id = $1", [id]);
}

export async function listCompletedBetween(startIso: string, endIso: string): Promise<Article[]> {
  try {
    const p = getPoolOrNull();
    if (!p) return [];
    await ensureSchema();
    const { rows } = await p.query<ArticleRow>(
      "SELECT * FROM articles WHERE status = 'done' AND completed_at >= $1 AND completed_at < $2 ORDER BY completed_at DESC",
      [startIso, endIso],
    );
    return rows.map(rowToArticle);
  } catch (error) {
    console.error("[db] listCompletedBetween failed:", error);
    return [];
  }
}
