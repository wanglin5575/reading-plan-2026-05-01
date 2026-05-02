import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { isAuthEnabled } from "./auth";
import type { Article, BrowseTopic } from "./types";
import type { MediaKind } from "./media-kind";
import type { BrowseTopicFeed, BrowseStoredHit } from "./browse-storage";

/**
 * 未配置 DATABASE_URL 时，在 next dev 下返回与 seed 一致的示例数据，便于本地直接看待读/已读样式。
 */
function devFallbackArticles(): Article[] {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const excerpt = "这是本地演示用的节选文本，用于展示列表与左滑标记已读。";
  return [
    {
      id: "11111111-1111-4111-8111-111111111101",
      url: "https://example.com/demo-todo",
      title: "示例 · 待读（可左滑露出已读）",
      author: "本地演示",
      domain: "example.com",
      theme: "效率 / 工具",
      featured: false,
      mediaType: "article",
      titleZh: "",
      summary: "用于本地开发演示：在待读列表中可见，向左滑动卡片可露出「已读」按钮。",
      language: "zh",
      charCount: 120,
      wordCount: 20,
      estimatedMinutes: 3,
      recommendedDepth: "skim",
      knowledgeTags: ["演示", "待读"],
      status: "todo",
      addedAt: now,
      dueDate: today,
      completedAt: null,
      readOneLiner: "",
      readKeyPoints: [],
      readAction: "",
      rawExcerpt: excerpt,
    },
    {
      id: "22222222-2222-4222-8222-222222222202",
      url: "https://example.com/demo-done",
      title: "示例 · 已读（含读后笔记）",
      author: "本地演示",
      domain: "example.com",
      theme: "产品 / 设计",
      featured: true,
      mediaType: "article",
      titleZh: "",
      summary: "已读列表示例：包含完整读后输出，可从「更多」里编辑信息或删除。",
      language: "zh",
      charCount: 150,
      wordCount: 25,
      estimatedMinutes: 4,
      recommendedDepth: "deep",
      knowledgeTags: ["已读", "示例"],
      status: "done",
      addedAt: now,
      dueDate: today,
      completedAt: now,
      readOneLiner: "演示用一句话总结：读懂了如何把交互做完。",
      readKeyPoints: ["演示观点一", "演示观点二", "演示观点三"],
      readAction: "在本周复盘里跟进一条行动项。",
      rawExcerpt: excerpt,
    },
  ];
}

function getConnectionString(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL ||
    null
  );
}

/** 是否配置了数据库（随览多端同步、主题持久化等依赖此项） */
export function isDatabaseConfigured(): boolean {
  return getConnectionString() !== null;
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
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS user_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_articles_user_id ON articles(user_id);
      `);
      await p.query(`
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '未知作者';
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_one_liner TEXT NOT NULL DEFAULT '';
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_key_points JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS read_action TEXT NOT NULL DEFAULT '';
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS browse_topics (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_browse_topics_user_id ON browse_topics(user_id);
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS browse_topic_feeds (
          user_id TEXT NOT NULL,
          topic_id TEXT NOT NULL,
          last_refresh_at TIMESTAMPTZ,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, topic_id)
        );
        CREATE INDEX IF NOT EXISTS idx_browse_topic_feeds_updated ON browse_topic_feeds(updated_at);
      `);
      await p.query(`
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS title_zh TEXT NOT NULL DEFAULT '';
      `);
      await p.query(`ALTER TABLE articles DROP COLUMN IF EXISTS custom_tags;`);
      await seedDemoIfEmpty(p);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function seedDemoIfEmpty(p: Pool): Promise<void> {
  if (process.env.SEED_DEMO_ARTICLES !== "1") return;
  if (isAuthEnabled()) return;
  const { rows } = await p.query<{ c: string }>("SELECT COUNT(*)::text AS c FROM articles");
  if (parseInt(rows[0].c, 10) > 0) return;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const todoId = "11111111-1111-4111-8111-111111111101";
  const doneId = "22222222-2222-4222-8222-222222222202";

  const excerpt = "这是本地演示用的节选文本，用于展示列表与左滑标记已读。";

  await p.query(
    `INSERT INTO articles (
      id, url, title, title_zh, author, domain, theme, featured, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date, completed_at,
      read_one_liner, read_key_points, read_action, raw_excerpt, media_type, user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23, $24, $25
    )`,
    [
      todoId,
      "https://example.com/demo-todo",
      "示例 · 待读（可左滑露出已读）",
      "",
      "本地演示",
      "example.com",
      "效率 / 工具",
      false,
      "用于本地开发演示：在待读列表中可见，向左滑动卡片可露出「已读」按钮。",
      "zh",
      120,
      20,
      3,
      "skim",
      JSON.stringify(["演示", "待读"]),
      "todo",
      now,
      today,
      null,
      "",
      JSON.stringify([]),
      "",
      excerpt,
      "article",
      null,
    ],
  );

  await p.query(
    `INSERT INTO articles (
      id, url, title, title_zh, author, domain, theme, featured, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date, completed_at,
      read_one_liner, read_key_points, read_action, raw_excerpt, media_type, user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23, $24, $25
    )`,
    [
      doneId,
      "https://example.com/demo-done",
      "示例 · 已读（含读后笔记）",
      "",
      "本地演示",
      "example.com",
      "产品 / 设计",
      true,
      "已读列表示例：包含完整读后输出，可从「更多」里编辑信息或删除。",
      "zh",
      150,
      25,
      4,
      "deep",
      JSON.stringify(["已读", "示例"]),
      "done",
      now,
      today,
      now,
      "演示用一句话总结：读懂了如何把交互做完。",
      JSON.stringify(["演示观点一", "演示观点二", "演示观点三"]),
      "在本周复盘里跟进一条行动项。",
      excerpt,
      "article",
      null,
    ],
  );
}

interface ArticleRow {
  id: string;
  url: string;
  title: string;
  author: string;
  domain: string;
  theme: string;
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
  media_type?: string | null;
  title_zh?: string | null;
}

function normalizeMediaType(raw: string | null | undefined): MediaKind {
  if (raw === "video" || raw === "audio" || raw === "article") return raw;
  return "article";
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
  const knowledgeTags: string[] = Array.isArray(rawKt) ? rawKt.map(String) : [];
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
    titleZh: row.title_zh?.trim() || "",
    author: row.author || "未知作者",
    domain: row.domain,
    theme: row.theme,
    featured: Boolean(row.featured),
    mediaType: normalizeMediaType(row.media_type),
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

export async function insertArticle(article: Article, ownerUserId: string | null): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  const uid = isAuthEnabled() ? ownerUserId : null;
  if (isAuthEnabled() && !uid) throw new Error("auth_required");
  await p.query(
    `INSERT INTO articles (
      id, url, title, title_zh, author, domain, theme, featured, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date, completed_at,
      read_one_liner, read_key_points, read_action, raw_excerpt, media_type, user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23, $24, $25
    )`,
    [
      article.id,
      article.url,
      article.title,
      article.titleZh || "",
      article.author || "未知作者",
      article.domain,
      article.theme,
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
      article.mediaType || "article",
      uid,
    ],
  );
}

export async function updateArticle(article: Article, ownerUserId: string | null): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  if (isAuthEnabled()) {
    if (!ownerUserId) throw new Error("auth_required");
    await p.query(
      `UPDATE articles SET
      title = $1,
      title_zh = $2,
      author = $3,
      theme = $4,
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
      media_type = $19,
      raw_excerpt = $20
    WHERE id = $21 AND user_id = $22`,
      [
        article.title,
        article.titleZh || "",
        article.author || "未知作者",
        article.theme,
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
        article.mediaType || "article",
        article.rawExcerpt,
        article.id,
        ownerUserId,
      ],
    );
    return;
  }
  await p.query(
    `UPDATE articles SET
      title = $1,
      title_zh = $2,
      author = $3,
      theme = $4,
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
      media_type = $19,
      raw_excerpt = $20
    WHERE id = $21`,
    [
      article.title,
      article.titleZh || "",
      article.author || "未知作者",
      article.theme,
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
      article.mediaType || "article",
      article.rawExcerpt,
      article.id,
    ],
  );
}

export async function listArticlesForUser(userId: string | null): Promise<Article[]> {
  try {
    const p = getPoolOrNull();
    if (!p) {
      if (process.env.NODE_ENV === "development") {
        return devFallbackArticles();
      }
      return [];
    }
    await ensureSchema();
    if (isAuthEnabled()) {
      if (!userId) return [];
      const { rows } = await p.query<ArticleRow>(
        "SELECT * FROM articles WHERE user_id = $1 ORDER BY due_date ASC, added_at DESC",
        [userId],
      );
      return rows.map(rowToArticle);
    }
    const { rows } = await p.query<ArticleRow>("SELECT * FROM articles ORDER BY due_date ASC, added_at DESC");
    return rows.map(rowToArticle);
  } catch (error) {
    console.error("[db] listArticlesForUser failed:", error);
    return [];
  }
}

export async function getArticle(id: string, ownerUserId: string | null): Promise<Article | null> {
  try {
    const p = getPoolOrNull();
    if (!p) return null;
    await ensureSchema();
    if (isAuthEnabled()) {
      if (!ownerUserId) return null;
      const { rows } = await p.query<ArticleRow>(
        "SELECT * FROM articles WHERE id = $1 AND user_id = $2 LIMIT 1",
        [id, ownerUserId],
      );
      const row = rows[0];
      return row ? rowToArticle(row) : null;
    }
    const { rows } = await p.query<ArticleRow>("SELECT * FROM articles WHERE id = $1 LIMIT 1", [id]);
    const row = rows[0];
    return row ? rowToArticle(row) : null;
  } catch (error) {
    console.error("[db] getArticle failed:", error);
    return null;
  }
}

export async function deleteArticle(id: string, ownerUserId: string | null): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  if (isAuthEnabled()) {
    if (!ownerUserId) throw new Error("auth_required");
    await p.query("DELETE FROM articles WHERE id = $1 AND user_id = $2", [id, ownerUserId]);
    return;
  }
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

const NO_DB_BROWSE_TOPIC_ID = "local-browse-default";

const STATIC_DEFAULT_BROWSE_TOPIC: BrowseTopic = {
  id: NO_DB_BROWSE_TOPIC_ID,
  name: "AI Evals",
  keywords: ["Hamel", "Shreya", "Stella&Amy", "Anthropic"],
  sortOrder: 0,
  createdAt: new Date(0).toISOString(),
};

function browseOwnerKey(userId: string | null): string {
  return userId ?? "anon";
}

interface BrowseTopicRow {
  id: string;
  name: string;
  keywords: unknown;
  sort_order: number;
  created_at: Date | string;
}

function rowToBrowseTopic(row: BrowseTopicRow): BrowseTopic {
  const raw = safeJsonArray(row.keywords);
  const keywords: string[] = Array.isArray(raw) ? raw.map(String) : [];
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    id: row.id,
    name: row.name,
    keywords,
    sortOrder: row.sort_order,
    createdAt,
  };
}

async function seedBrowseTopicsIfEmpty(p: Pool, userId: string): Promise<void> {
  const { rows } = await p.query<{ c: string }>(
    "SELECT COUNT(*)::text AS c FROM browse_topics WHERE user_id = $1",
    [userId],
  );
  if (parseInt(rows[0].c, 10) > 0) return;
  await p.query(
    `INSERT INTO browse_topics (id, user_id, name, keywords, sort_order)
     VALUES ($1, $2, $3, $4::jsonb, 0)`,
    [
      randomUUID(),
      userId,
      "AI Evals",
      JSON.stringify(["Hamel", "Shreya", "Stella&Amy", "Anthropic"]),
    ],
  );
}

export async function listBrowseTopics(userId: string | null): Promise<BrowseTopic[]> {
  const owner = browseOwnerKey(userId);
  const p = getPoolOrNull();
  if (!p) return [{ ...STATIC_DEFAULT_BROWSE_TOPIC, createdAt: new Date().toISOString() }];
  try {
    await ensureSchema();
    await seedBrowseTopicsIfEmpty(p, owner);
    const { rows } = await p.query<BrowseTopicRow>(
      "SELECT id, name, keywords, sort_order, created_at FROM browse_topics WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC",
      [owner],
    );
    return rows.map(rowToBrowseTopic);
  } catch (e) {
    console.error("[db] listBrowseTopics failed:", e);
    return [{ ...STATIC_DEFAULT_BROWSE_TOPIC, createdAt: new Date().toISOString() }];
  }
}

export async function getBrowseTopic(id: string, userId: string | null): Promise<BrowseTopic | null> {
  const owner = browseOwnerKey(userId);
  const p = getPoolOrNull();
  if (!p) return id === NO_DB_BROWSE_TOPIC_ID ? { ...STATIC_DEFAULT_BROWSE_TOPIC, createdAt: new Date().toISOString() } : null;
  try {
    await ensureSchema();
    const { rows } = await p.query<BrowseTopicRow>(
      "SELECT id, name, keywords, sort_order, created_at FROM browse_topics WHERE id = $1 AND user_id = $2 LIMIT 1",
      [id, owner],
    );
    const row = rows[0];
    return row ? rowToBrowseTopic(row) : null;
  } catch (e) {
    console.error("[db] getBrowseTopic failed:", e);
    return null;
  }
}

export async function insertBrowseTopic(
  userId: string | null,
  name: string,
  keywords: string[],
): Promise<BrowseTopic> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  const cleanKw = keywords.map((k) => k.trim()).filter(Boolean);
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("invalid_name");
  if (!cleanKw.length) throw new Error("invalid_keywords");
  await ensureSchema();
  const id = randomUUID();
  const { rows: maxRows } = await p.query<{ m: string | null }>(
    "SELECT MAX(sort_order)::text AS m FROM browse_topics WHERE user_id = $1",
    [owner],
  );
  const m = maxRows[0]?.m;
  const nextOrder = m != null && m !== "" ? parseInt(m, 10) + 1 : 0;
  await p.query(
    `INSERT INTO browse_topics (id, user_id, name, keywords, sort_order) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, owner, trimmedName, JSON.stringify(cleanKw), nextOrder],
  );
  const row = await getBrowseTopic(id, userId);
  if (!row) throw new Error("insert_failed");
  return row;
}

export async function updateBrowseTopic(
  id: string,
  userId: string | null,
  patch: { name?: string; keywords?: string[] },
): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  await ensureSchema();
  if (patch.name !== undefined && patch.keywords !== undefined) {
    const cleanKw = patch.keywords.map((k) => k.trim()).filter(Boolean);
    if (!cleanKw.length) throw new Error("invalid_keywords");
    await p.query(
      "UPDATE browse_topics SET name = $1, keywords = $2::jsonb WHERE id = $3 AND user_id = $4",
      [patch.name.trim(), JSON.stringify(cleanKw), id, owner],
    );
    return;
  }
  if (patch.name !== undefined) {
    await p.query("UPDATE browse_topics SET name = $1 WHERE id = $2 AND user_id = $3", [
      patch.name.trim(),
      id,
      owner,
    ]);
  }
  if (patch.keywords !== undefined) {
    const cleanKw = patch.keywords.map((k) => k.trim()).filter(Boolean);
    if (!cleanKw.length) throw new Error("invalid_keywords");
    await p.query("UPDATE browse_topics SET keywords = $1::jsonb WHERE id = $2 AND user_id = $3", [
      JSON.stringify(cleanKw),
      id,
      owner,
    ]);
  }
}

export async function deleteBrowseTopic(id: string, userId: string | null): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  await ensureSchema();
  await p.query("DELETE FROM browse_topic_feeds WHERE topic_id = $1 AND user_id = $2", [id, owner]);
  await p.query("DELETE FROM browse_topics WHERE id = $1 AND user_id = $2", [id, owner]);
}

interface BrowseTopicFeedRow {
  last_refresh_at: Date | string | null;
  items: unknown;
}

export async function getBrowseTopicFeed(userId: string | null, topicId: string): Promise<BrowseTopicFeed | null> {
  const p = getPoolOrNull();
  if (!p) return null;
  const owner = browseOwnerKey(userId);
  try {
    await ensureSchema();
    const { rows } = await p.query<BrowseTopicFeedRow>(
      "SELECT last_refresh_at, items FROM browse_topic_feeds WHERE user_id = $1 AND topic_id = $2 LIMIT 1",
      [owner, topicId],
    );
    const row = rows[0];
    if (!row) return null;
    const raw = row.items;
    const items: BrowseStoredHit[] = Array.isArray(raw) ? (raw as BrowseStoredHit[]) : [];
    const lr = row.last_refresh_at;
    const lastRefreshAt =
      lr instanceof Date ? lr.toISOString() : lr != null && String(lr).length ? String(lr) : null;
    return { lastRefreshAt, items };
  } catch (e) {
    console.error("[db] getBrowseTopicFeed failed:", e);
    return null;
  }
}

export async function upsertBrowseTopicFeed(
  userId: string | null,
  topicId: string,
  feed: BrowseTopicFeed,
): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  await ensureSchema();
  await p.query(
    `INSERT INTO browse_topic_feeds (user_id, topic_id, last_refresh_at, items, updated_at)
     VALUES ($1, $2, $3::timestamptz, $4::jsonb, NOW())
     ON CONFLICT (user_id, topic_id) DO UPDATE SET
       last_refresh_at = EXCLUDED.last_refresh_at,
       items = EXCLUDED.items,
       updated_at = NOW()`,
    [owner, topicId, feed.lastRefreshAt, JSON.stringify(feed.items)],
  );
}
