import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { isAuthEnabled } from "./auth";
import type { Article, BrowseAiRejectedItem, BrowseTopic } from "./types";
import { estimateUsdForPromptCompletion, estimateUsdForPromptCompletionWithCache } from "@/lib/token-pricing";
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
      publishedAt: null,
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
      publishedAt: null,
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
      raw_excerpt TEXT NOT NULL,
      published_date DATE
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
        ALTER TABLE browse_topics ADD COLUMN IF NOT EXISTS seed_sources JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE browse_topics ADD COLUMN IF NOT EXISTS max_published_age_days INTEGER;
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
        ALTER TABLE browse_topic_feeds
        ADD COLUMN IF NOT EXISTS ai_rejected JSONB NOT NULL DEFAULT '[]'::jsonb;
      `);
      await p.query(`
        ALTER TABLE articles ADD COLUMN IF NOT EXISTS title_zh TEXT NOT NULL DEFAULT '';
      `);
      await p.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS published_date DATE;`);
      await p.query(
        `ALTER TABLE articles ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'article';`,
      );
      await p.query(`ALTER TABLE articles DROP COLUMN IF EXISTS custom_tags;`);
      await p.query(`
        CREATE TABLE IF NOT EXISTS app_user_registry (
          user_id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_app_user_registry_reg ON app_user_registry (registered_at);
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS token_usage_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          source TEXT NOT NULL,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          cached_prompt_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage_log(created_at);
      `);
      await p.query(`
        ALTER TABLE token_usage_log ADD COLUMN IF NOT EXISTS cached_prompt_tokens INTEGER NOT NULL DEFAULT 0;
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS vip_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_vip_accounts_enabled ON vip_accounts (enabled);
      `);
      await p.query(`
        ALTER TABLE vip_accounts ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
      `);
      await p.query(`
        CREATE TABLE IF NOT EXISTS ai_generation_cache (
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          input_hash TEXT NOT NULL,
          result_json JSONB NOT NULL,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, kind, input_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_ai_gen_cache_updated ON ai_generation_cache (updated_at);
      `);
      await migrateTokenUsageLogAggregated(p);
      await seedDemoIfEmpty(p);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** 合并按主题拆分的旧行、写入缓存输入列并重算金额（一次性补丁） */
async function migrateTokenUsageLogAggregated(p: Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS _reading_plan_schema_patches (
      key TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: topicCol } = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'token_usage_log' AND column_name = 'browse_topic_id' LIMIT 1`,
  );

  if (topicCol.length > 0) {
    await p.query("BEGIN");
    try {
      await p.query(`DROP INDEX IF EXISTS idx_token_usage_user_topic`);
      await p.query(`
        CREATE TEMP TABLE _rp_tul_agg AS
        SELECT
          gen_random_uuid()::text AS id,
          user_id,
          COALESCE(NULLIF(TRIM(source), ''), 'unknown') AS source,
          (LEAST(2147483647, SUM(prompt_tokens::bigint)))::integer AS prompt_tokens,
          (LEAST(2147483647, SUM(completion_tokens::bigint)))::integer AS completion_tokens,
          (LEAST(2147483647, SUM(total_tokens::bigint)))::integer AS total_tokens,
          (LEAST(2147483647, SUM((3 * GREATEST(0, prompt_tokens))::bigint)))::integer AS cached_prompt_tokens,
          MIN(created_at) AS created_at
        FROM token_usage_log
        GROUP BY user_id,
          COALESCE(NULLIF(TRIM(source), ''), 'unknown'),
          (created_at AT TIME ZONE 'UTC')::date
      `);
      await p.query(`TRUNCATE token_usage_log`);
      await p.query(`
        INSERT INTO token_usage_log (id, user_id, source, prompt_tokens, completion_tokens, total_tokens, cached_prompt_tokens, cost_usd, created_at)
        SELECT id, user_id, source, prompt_tokens, completion_tokens, total_tokens, cached_prompt_tokens, 0, created_at
        FROM _rp_tul_agg
      `);
      await p.query(`ALTER TABLE token_usage_log DROP COLUMN browse_topic_id`);
      await p.query("COMMIT");
    } catch (e) {
      await p.query("ROLLBACK");
      console.error("[db] migrateTokenUsageLogAggregated (topic merge) failed:", e);
      throw e;
    }
  }

  const { rows: patched } = await p.query(
    `SELECT 1 FROM _reading_plan_schema_patches WHERE key = $1 LIMIT 1`,
    ["token_usage_cache_cost_v2"],
  );
  if (patched.length === 0) {
    await refreshTokenUsageLogDerivedColumns(p);
    await p.query(`INSERT INTO _reading_plan_schema_patches (key) VALUES ($1)`, ["token_usage_cache_cost_v2"]);
  }
}

async function refreshTokenUsageLogDerivedColumns(p: Pool): Promise<void> {
  const { rows } = await p.query<{ id: string; pt: number; ct: number }>(
    `SELECT id, prompt_tokens AS pt, completion_tokens AS ct FROM token_usage_log`,
  );
  for (const r of rows) {
    const cp = 3 * Math.max(0, r.pt);
    const cost = estimateUsdForPromptCompletionWithCache(r.pt, r.ct, cp);
    await p.query(
      `UPDATE token_usage_log SET cached_prompt_tokens = $2, cost_usd = $3::numeric WHERE id = $1`,
      [r.id, cp, cost.toFixed(8)],
    );
  }
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
      read_one_liner, read_key_points, read_action, raw_excerpt, media_type, published_date, user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23, $24, $25::date, $26
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
      null,
    ],
  );

  await p.query(
    `INSERT INTO articles (
      id, url, title, title_zh, author, domain, theme, featured, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date, completed_at,
      read_one_liner, read_key_points, read_action, raw_excerpt, media_type, published_date, user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23, $24, $25::date, $26
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
      null,
    ],
  );
}

function normalizePublishedDateRow(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "string") return raw.length >= 10 ? raw.slice(0, 10) : null;
  return null;
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
  published_date?: string | Date | null;
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
    publishedAt: normalizePublishedDateRow(row.published_date),
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
      read_one_liner, read_key_points, read_action, raw_excerpt, media_type, published_date, user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      $13, $14, $15::jsonb, $16, $17::timestamptz, $18::date, $19::timestamptz,
      $20, $21::jsonb, $22, $23, $24, $25::date, $26
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
      article.publishedAt ?? null,
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
      raw_excerpt = $20,
      published_date = $21::date
    WHERE id = $22 AND user_id = $23`,
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
        article.publishedAt ?? null,
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
      raw_excerpt = $20,
      published_date = $21::date
    WHERE id = $22`,
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
      article.publishedAt ?? null,
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

/** 与随览等多租户逻辑一致：未登录使用 anon 桶 */
export function aiCacheOwnerKey(userId: string | null): string {
  return userId ?? "anon";
}

function browseOwnerKey(userId: string | null): string {
  return aiCacheOwnerKey(userId);
}

const AI_CACHE_KIND_MAX = 80;
const AI_CACHE_HASH_MAX = 128;

export async function getAiGenerationCache(
  userId: string | null,
  kind: string,
  inputHash: string,
): Promise<Record<string, unknown> | null> {
  try {
    const p = getPoolOrNull();
    if (!p) return null;
    await ensureSchema();
    const { rows } = await p.query<{ result_json: unknown }>(
      `SELECT result_json FROM ai_generation_cache
       WHERE user_id = $1 AND kind = $2 AND input_hash = $3 LIMIT 1`,
      [
        aiCacheOwnerKey(userId),
        kind.slice(0, AI_CACHE_KIND_MAX),
        inputHash.slice(0, AI_CACHE_HASH_MAX),
      ],
    );
    const r = rows[0]?.result_json;
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    return r as Record<string, unknown>;
  } catch (e) {
    console.error("[db] getAiGenerationCache failed:", e);
    return null;
  }
}

export async function upsertAiGenerationCache(
  userId: string | null,
  kind: string,
  inputHash: string,
  resultJson: Record<string, unknown>,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
): Promise<void> {
  try {
    const p = getPoolOrNull();
    if (!p) return;
    await ensureSchema();
    await p.query(
      `INSERT INTO ai_generation_cache (
         user_id, kind, input_hash, result_json,
         prompt_tokens, completion_tokens, total_tokens, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
       ON CONFLICT (user_id, kind, input_hash) DO UPDATE SET
         result_json = EXCLUDED.result_json,
         prompt_tokens = EXCLUDED.prompt_tokens,
         completion_tokens = EXCLUDED.completion_tokens,
         total_tokens = EXCLUDED.total_tokens,
         updated_at = NOW()`,
      [
        aiCacheOwnerKey(userId),
        kind.slice(0, AI_CACHE_KIND_MAX),
        inputHash.slice(0, AI_CACHE_HASH_MAX),
        JSON.stringify(resultJson),
        usage?.promptTokens ?? 0,
        usage?.completionTokens ?? 0,
        usage?.totalTokens ?? 0,
      ],
    );
  } catch (e) {
    console.error("[db] upsertAiGenerationCache failed:", e);
  }
}

interface BrowseTopicRow {
  id: string;
  name: string;
  keywords: unknown;
  sort_order: number;
  created_at: Date | string;
  seed_sources?: unknown;
  max_published_age_days?: number | null;
}

function rowToBrowseTopic(row: BrowseTopicRow): BrowseTopic {
  const raw = safeJsonArray(row.keywords);
  const keywords: string[] = Array.isArray(raw) ? raw.map(String) : [];
  const rawSeeds = safeJsonArray(row.seed_sources);
  const seedSources: string[] = Array.isArray(rawSeeds) ? rawSeeds.map(String) : [];
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  let maxPublishedAgeDays: number | null = null;
  if (row.max_published_age_days != null) {
    const n = Number(row.max_published_age_days);
    if (Number.isFinite(n)) maxPublishedAgeDays = Math.round(n);
  }
  return {
    id: row.id,
    name: row.name,
    keywords,
    seedSources,
    maxPublishedAgeDays,
    sortOrder: row.sort_order,
    createdAt,
  };
}

export async function listBrowseTopics(userId: string | null): Promise<BrowseTopic[]> {
  const owner = browseOwnerKey(userId);
  const p = getPoolOrNull();
  if (!p) return [];
  try {
    await ensureSchema();
    const { rows } = await p.query<BrowseTopicRow>(
      "SELECT id, name, keywords, sort_order, created_at, seed_sources, max_published_age_days FROM browse_topics WHERE user_id = $1 ORDER BY sort_order ASC, created_at ASC",
      [owner],
    );
    return rows.map(rowToBrowseTopic);
  } catch (e) {
    console.error("[db] listBrowseTopics failed:", e);
    return [];
  }
}

export async function getBrowseTopic(id: string, userId: string | null): Promise<BrowseTopic | null> {
  const owner = browseOwnerKey(userId);
  const p = getPoolOrNull();
  if (!p) return null;
  try {
    await ensureSchema();
    const { rows } = await p.query<BrowseTopicRow>(
      "SELECT id, name, keywords, sort_order, created_at, seed_sources, max_published_age_days FROM browse_topics WHERE id = $1 AND user_id = $2 LIMIT 1",
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
  opts?: { seedSources?: string[]; maxPublishedAgeDays?: number | null },
): Promise<BrowseTopic> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  const cleanKw = keywords.map((k) => k.trim()).filter(Boolean);
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("invalid_name");
  if (!cleanKw.length) throw new Error("invalid_keywords");
  const seeds = [...new Set((opts?.seedSources ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, 40);
  for (const s of seeds) {
    if (s.length > 800) throw new Error("invalid_seed_sources");
  }
  await ensureSchema();
  const id = randomUUID();
  const { rows: maxRows } = await p.query<{ m: string | null }>(
    "SELECT MAX(sort_order)::text AS m FROM browse_topics WHERE user_id = $1",
    [owner],
  );
  const m = maxRows[0]?.m;
  const nextOrder = m != null && m !== "" ? parseInt(m, 10) + 1 : 0;
  let maxDays: number | null = opts?.maxPublishedAgeDays ?? null;
  if (maxDays != null && (!Number.isFinite(maxDays) || maxDays < 1 || maxDays > 3650)) {
    throw new Error("invalid_max_age");
  }
  await p.query(
    `INSERT INTO browse_topics (id, user_id, name, keywords, sort_order, seed_sources, max_published_age_days) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)`,
    [id, owner, trimmedName, JSON.stringify(cleanKw), nextOrder, JSON.stringify(seeds), maxDays],
  );
  const row = await getBrowseTopic(id, userId);
  if (!row) throw new Error("insert_failed");
  return row;
}

export async function updateBrowseTopic(
  id: string,
  userId: string | null,
  patch: Partial<{ name: string; keywords: string[]; seedSources: string[]; maxPublishedAgeDays: number | null }>,
): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  await ensureSchema();
  const cur = await getBrowseTopic(id, userId);
  if (!cur) throw new Error("not_found");

  const nextName = patch.name !== undefined ? patch.name.trim() : cur.name;
  const nextKw =
    patch.keywords !== undefined ? patch.keywords.map((k) => k.trim()).filter(Boolean) : cur.keywords;
  if (!nextKw.length) throw new Error("invalid_keywords");

  let nextSeeds = cur.seedSources ?? [];
  if (patch.seedSources !== undefined) {
    nextSeeds = [...new Set(patch.seedSources.map((s) => s.trim()).filter(Boolean))].slice(0, 40);
    for (const s of nextSeeds) {
      if (s.length > 800) throw new Error("invalid_seed_sources");
    }
  }

  let nextMax = cur.maxPublishedAgeDays ?? null;
  if (patch.maxPublishedAgeDays !== undefined) {
    nextMax = patch.maxPublishedAgeDays;
    if (nextMax != null && (!Number.isFinite(nextMax) || nextMax < 1 || nextMax > 3650)) {
      throw new Error("invalid_max_age");
    }
  }

  await p.query(
    `UPDATE browse_topics SET name = $1, keywords = $2::jsonb, seed_sources = $3::jsonb, max_published_age_days = $4 WHERE id = $5 AND user_id = $6`,
    [nextName, JSON.stringify(nextKw), JSON.stringify(nextSeeds), nextMax, id, owner],
  );
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
  ai_rejected?: unknown;
}

export async function getBrowseTopicFeed(userId: string | null, topicId: string): Promise<BrowseTopicFeed | null> {
  const p = getPoolOrNull();
  if (!p) return null;
  const owner = browseOwnerKey(userId);
  try {
    await ensureSchema();
    const { rows } = await p.query<BrowseTopicFeedRow>(
      "SELECT last_refresh_at, items, ai_rejected FROM browse_topic_feeds WHERE user_id = $1 AND topic_id = $2 LIMIT 1",
      [owner, topicId],
    );
    const row = rows[0];
    if (!row) return null;
    const raw = row.items;
    const items: BrowseStoredHit[] = Array.isArray(raw) ? (raw as BrowseStoredHit[]) : [];
    const rejRaw = row.ai_rejected;
    const aiRejected: BrowseAiRejectedItem[] = Array.isArray(rejRaw) ? (rejRaw as BrowseAiRejectedItem[]) : [];
    const lr = row.last_refresh_at;
    const lastRefreshAt =
      lr instanceof Date ? lr.toISOString() : lr != null && String(lr).length ? String(lr) : null;
    return { lastRefreshAt, items, aiRejected: aiRejected ?? [] };
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
  const aiRejected = feed.aiRejected ?? [];
  await p.query(
    `INSERT INTO browse_topic_feeds (user_id, topic_id, last_refresh_at, items, ai_rejected, updated_at)
     VALUES ($1, $2, $3::timestamptz, $4::jsonb, $5::jsonb, NOW())
     ON CONFLICT (user_id, topic_id) DO UPDATE SET
       last_refresh_at = EXCLUDED.last_refresh_at,
       items = EXCLUDED.items,
       ai_rejected = EXCLUDED.ai_rejected,
       updated_at = NOW()`,
    [owner, topicId, feed.lastRefreshAt, JSON.stringify(feed.items), JSON.stringify(aiRejected)],
  );
}

export async function upsertUserRegistry(params: {
  userId: string;
  email: string;
  registeredAtIso?: string | null;
}): Promise<void> {
  const p = getPoolOrNull();
  if (!p) return;
  const email = params.email.trim() || "(no-email)";
  let regIso = params.registeredAtIso?.trim() || null;
  if (regIso) {
    const t = Date.parse(regIso);
    if (Number.isNaN(t)) regIso = null;
  }
  try {
    await ensureSchema();
    await p.query(
      `INSERT INTO app_user_registry (user_id, email, registered_at, first_seen_at)
       VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email`,
      [params.userId, email, regIso],
    );
  } catch (e) {
    console.error("[db] upsertUserRegistry failed:", e);
  }
}

export async function recordTokenUsage(params: {
  userId: string;
  source: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}): Promise<void> {
  const p = getPoolOrNull();
  if (!p) return;
  try {
    await ensureSchema();
    const pt = Math.max(0, Math.round(params.promptTokens));
    const ct = Math.max(0, Math.round(params.completionTokens));
    const cached = 3 * pt;
    const cost = estimateUsdForPromptCompletionWithCache(pt, ct, cached);
    await p.query(
      `INSERT INTO token_usage_log (id, user_id, source, prompt_tokens, completion_tokens, total_tokens, cached_prompt_tokens, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric)`,
      [
        randomUUID(),
        params.userId,
        params.source.slice(0, 64),
        pt,
        ct,
        Math.max(0, Math.round(params.totalTokens)),
        cached,
        cost.toFixed(8),
      ],
    );
  } catch (e) {
    console.error("[db] recordTokenUsage failed:", e);
  }
}

export async function clearBrowseTopicFeed(userId: string | null, topicId: string): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  const owner = browseOwnerKey(userId);
  await ensureSchema();
  await p.query("DELETE FROM browse_topic_feeds WHERE user_id = $1 AND topic_id = $2", [owner, topicId]);
}

export type RegistryUserRow = {
  userId: string;
  email: string;
  registeredAt: string;
};

export async function listAllRegistryUsers(): Promise<RegistryUserRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{ user_id: string; email: string; registered_at: Date | string }>(
    "SELECT user_id, email, registered_at FROM app_user_registry ORDER BY registered_at ASC",
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    registeredAt:
      r.registered_at instanceof Date ? r.registered_at.toISOString() : String(r.registered_at),
  }));
}

/** 管理端红点：registered_at 晚于该时间的登记用户数 */
export async function countRegistryUsersRegisteredAfter(sinceIso: string): Promise<number> {
  const p = getPoolOrNull();
  if (!p) return 0;
  await ensureSchema();
  const t = Date.parse(sinceIso.trim());
  if (Number.isNaN(t)) return 0;
  const { rows } = await p.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM app_user_registry WHERE registered_at > $1::timestamptz`,
    [new Date(t).toISOString()],
  );
  return parseInt(rows[0]?.c ?? "0", 10) || 0;
}

export type BrowseTopicsSummary = {
  /** 随览主题名称，「；」分隔 */
  topicTitles: string;
  /** 各主题关键词去重后「，」分隔 */
  keywordsLine: string;
};

/** 管理后台：按用户汇总 browse_topics 的主题名与关键词 */
export async function loadBrowseSummariesByUser(): Promise<Map<string, BrowseTopicsSummary>> {
  const out = new Map<string, BrowseTopicsSummary>();
  const p = getPoolOrNull();
  if (!p) return out;
  await ensureSchema();
  try {
    const { rows } = await p.query<{ user_id: string; name: string; keywords: unknown }>(
      `SELECT user_id, name, keywords FROM browse_topics ORDER BY user_id, sort_order ASC, created_at ASC`,
    );
    const acc = new Map<string, { names: string[]; kw: Set<string> }>();
    for (const row of rows) {
      const uid = row.user_id;
      if (!acc.has(uid)) acc.set(uid, { names: [], kw: new Set() });
      const e = acc.get(uid)!;
      const nm = typeof row.name === "string" ? row.name.trim() : "";
      if (nm) e.names.push(nm);
      const rawKw = safeJsonArray(row.keywords);
      const arr = Array.isArray(rawKw) ? rawKw : [];
      for (const x of arr) {
        const s = String(x).trim();
        if (s) e.kw.add(s);
      }
    }
    for (const [uid, v] of acc) {
      const topicTitles = v.names.length ? v.names.join("；") : "—";
      const kws = [...v.kw];
      const keywordsLine = kws.length ? kws.join("，") : "—";
      out.set(uid, { topicTitles, keywordsLine });
    }
  } catch (e) {
    console.error("[db] loadBrowseSummariesByUser failed:", e);
  }
  return out;
}

export type TokenSumRow = {
  userId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export async function sumTokenUsageByUser(): Promise<TokenSumRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{ user_id: string; p: string; o: string; t: string }>(
    `SELECT user_id,
            SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t
     FROM token_usage_log GROUP BY user_id`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    promptTokens: parseInt(r.p, 10) || 0,
    completionTokens: parseInt(r.o, 10) || 0,
    totalTokens: parseInt(r.t, 10) || 0,
  }));
}

export type TokenUsageUserAggregateRow = {
  userId: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
};

/** 按用户汇总全站 token（不按主题拆分） */
export async function sumTokenUsageAggregatedByUser(): Promise<TokenUsageUserAggregateRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    user_id: string;
    p: string;
    o: string;
    t: string;
    cp: string;
    cost: string;
  }>(
    `SELECT user_id,
            SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t,
            SUM(cached_prompt_tokens)::text AS cp,
            SUM(cost_usd)::text AS cost
     FROM token_usage_log
     GROUP BY user_id`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    promptTokens: parseInt(r.p, 10) || 0,
    completionTokens: parseInt(r.o, 10) || 0,
    totalTokens: parseInt(r.t, 10) || 0,
    cachedPromptTokens: parseInt(r.cp, 10) || 0,
    costUsd: parseFloat(r.cost ?? "0") || 0,
  }));
}

export async function sumTokenUsageGlobal(): Promise<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens: number;
  totalCostUsd: number;
}> {
  const p = getPoolOrNull();
  if (!p)
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0, totalCostUsd: 0 };
  await ensureSchema();
  const { rows } = await p.query<{
    p: string | null;
    o: string | null;
    t: string | null;
    cp: string | null;
    cost: string | null;
  }>(
    `SELECT SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t,
            SUM(cached_prompt_tokens)::text AS cp,
            SUM(cost_usd)::text AS cost
     FROM token_usage_log`,
  );
  const row = rows[0];
  return {
    promptTokens: row?.p ? parseInt(row.p, 10) || 0 : 0,
    completionTokens: row?.o ? parseInt(row.o, 10) || 0 : 0,
    totalTokens: row?.t ? parseInt(row.t, 10) || 0 : 0,
    cachedPromptTokens: row?.cp ? parseInt(row.cp, 10) || 0 : 0,
    totalCostUsd: row?.cost ? parseFloat(row.cost) || 0 : 0,
  };
}

export type DailyAdminPoint = {
  day: string;
  newUsers: number;
  totalTokens: number;
  costUsd: number;
};

export async function getAdminDailySeries(params: {
  fromDay: string;
  toDay: string;
  /** 传入时仅统计该用户的 Token，且不返回「每日新增注册」（避免泄露全局注册趋势） */
  filterUserId?: string | null;
}): Promise<DailyAdminPoint[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();

  const uid = params.filterUserId?.trim() || null;
  const { rows: tokenRows } = uid
    ? await p.query<{ d: Date | string; p: string; o: string; t: string; cost: string }>(
        `SELECT (created_at AT TIME ZONE 'UTC')::date AS d,
                SUM(prompt_tokens)::text AS p,
                SUM(completion_tokens)::text AS o,
                SUM(total_tokens)::text AS t,
                SUM(cost_usd)::text AS cost
         FROM token_usage_log
         WHERE user_id = $3
           AND (created_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY 1`,
        [params.fromDay, params.toDay, uid],
      )
    : await p.query<{ d: Date | string; p: string; o: string; t: string; cost: string }>(
        `SELECT (created_at AT TIME ZONE 'UTC')::date AS d,
                SUM(prompt_tokens)::text AS p,
                SUM(completion_tokens)::text AS o,
                SUM(total_tokens)::text AS t,
                SUM(cost_usd)::text AS cost
         FROM token_usage_log
         WHERE (created_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY 1`,
        [params.fromDay, params.toDay],
      );

  let userRows: { d: Date | string; n: string }[] = [];
  if (!uid) {
    const ur = await p.query<{ d: Date | string; n: string }>(
      `SELECT (registered_at AT TIME ZONE 'UTC')::date AS d,
            COUNT(*)::text AS n
         FROM app_user_registry
         WHERE (registered_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
         GROUP BY 1 ORDER BY 1`,
      [params.fromDay, params.toDay],
    );
    userRows = ur.rows;
  }

  function dayKey(d: Date | string): string {
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const s = String(d);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  const map = new Map<string, DailyAdminPoint>();
  const start = new Date(`${params.fromDay}T00:00:00Z`);
  const end = new Date(`${params.toDay}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    map.set(day, { day, newUsers: 0, totalTokens: 0, costUsd: 0 });
  }
  for (const r of userRows) {
    const day = dayKey(r.d);
    const row = map.get(day);
    if (row) row.newUsers = parseInt(r.n, 10) || 0;
  }
  for (const r of tokenRows) {
    const day = dayKey(r.d);
    const row = map.get(day);
    if (row) {
      row.totalTokens = parseInt(r.t, 10) || 0;
      row.costUsd = parseFloat(r.cost ?? "0") || 0;
    }
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export type BrowseTopicAdminRow = {
  userId: string;
  topicId: string;
  topicName: string;
  keywords: unknown;
  sortOrder: number;
  createdAt: string;
};

/** 管理端：全部订阅主题行（邮箱×主题拆表用） */
export async function listBrowseTopicsForAdmin(): Promise<BrowseTopicAdminRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    user_id: string;
    id: string;
    name: string;
    keywords: unknown;
    sort_order: number;
    created_at: Date | string;
  }>(
    `SELECT user_id, id, name, keywords, sort_order, created_at
     FROM browse_topics
     ORDER BY user_id ASC, sort_order ASC, created_at ASC`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    topicId: r.id,
    topicName: typeof r.name === "string" ? r.name : String(r.name ?? ""),
    keywords: r.keywords,
    sortOrder: r.sort_order,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

/** 按用户 + 自然日汇总 token（管理端用量表） */
export type TokenUsageDayBucketRow = {
  userId: string;
  day: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
};

export async function sumTokenUsageByUserAndDay(): Promise<TokenUsageDayBucketRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    user_id: string;
    day: string;
    p: string;
    o: string;
    t: string;
    cp: string;
    cost: string;
  }>(
    `SELECT user_id,
            to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
            SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t,
            SUM(cached_prompt_tokens)::text AS cp,
            SUM(cost_usd)::text AS cost
     FROM token_usage_log
     GROUP BY user_id, (created_at AT TIME ZONE 'UTC')::date
     HAVING SUM(total_tokens) > 0
     ORDER BY user_id ASC, day DESC`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    day: r.day,
    promptTokens: parseInt(r.p, 10) || 0,
    completionTokens: parseInt(r.o, 10) || 0,
    cachedPromptTokens: parseInt(r.cp, 10) || 0,
    totalTokens: parseInt(r.t, 10) || 0,
    costUsd: parseFloat(r.cost ?? "0") || 0,
  }));
}

/** 单用户按自然日汇总（非管理员 token 弹窗） */
export async function sumTokenUsageDaysForUser(userId: string): Promise<TokenUsageDayBucketRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const uid = userId.trim();
  if (!uid) return [];
  const { rows } = await p.query<{
    day: string;
    p: string;
    o: string;
    t: string;
    cp: string;
    cost: string;
  }>(
    `SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
            SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t,
            SUM(cached_prompt_tokens)::text AS cp,
            SUM(cost_usd)::text AS cost
     FROM token_usage_log
     WHERE user_id = $1
     GROUP BY (created_at AT TIME ZONE 'UTC')::date
     HAVING SUM(total_tokens) > 0
     ORDER BY day DESC`,
    [uid],
  );
  return rows.map((r) => ({
    userId: uid,
    day: r.day,
    promptTokens: parseInt(r.p, 10) || 0,
    completionTokens: parseInt(r.o, 10) || 0,
    cachedPromptTokens: parseInt(r.cp, 10) || 0,
    totalTokens: parseInt(r.t, 10) || 0,
    costUsd: parseFloat(r.cost ?? "0") || 0,
  }));
}

export async function sumTokenUsageForSingleUser(userId: string): Promise<
  | (TokenSumRow & { cachedPromptTokens: number; totalCostUsd: number })
  | null
> {
  const p = getPoolOrNull();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{ p: string; o: string; t: string; cp: string; cost: string }>(
    `SELECT SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t,
            SUM(cached_prompt_tokens)::text AS cp,
            SUM(cost_usd)::text AS cost
     FROM token_usage_log
     WHERE user_id = $1
     GROUP BY user_id`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    userId,
    promptTokens: parseInt(r.p, 10) || 0,
    completionTokens: parseInt(r.o, 10) || 0,
    totalTokens: parseInt(r.t, 10) || 0,
    cachedPromptTokens: parseInt(r.cp, 10) || 0,
    totalCostUsd: parseFloat(r.cost ?? "0") || 0,
  };
}

export type TokenDailySliceRow = {
  day: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
};

/** 指定用户区间内的按日汇总（仅返回有消耗的日期；按日期倒序） */
export async function getTokenUsageDailySlice(params: {
  userId: string;
  fromDay: string;
  toDay: string;
}): Promise<TokenDailySliceRow[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const uid = params.userId.trim();
  if (!uid) return [];

  const { rows } = await p.query<{ day: string; p: string; o: string; t: string; cp: string; cost: string }>(
    `SELECT to_char((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
            SUM(prompt_tokens)::text AS p,
            SUM(completion_tokens)::text AS o,
            SUM(total_tokens)::text AS t,
            SUM(cached_prompt_tokens)::text AS cp,
            SUM(cost_usd)::text AS cost
     FROM token_usage_log
     WHERE user_id = $3
       AND (created_at AT TIME ZONE 'UTC')::date BETWEEN $1::date AND $2::date
     GROUP BY 1
     HAVING SUM(total_tokens) > 0
     ORDER BY 1 DESC`,
    [params.fromDay, params.toDay, uid],
  );

  return rows.map((r) => {
    const pt = parseInt(r.p, 10) || 0;
    const ct = parseInt(r.o, 10) || 0;
    const tt = parseInt(r.t, 10) || 0;
    const cp = parseInt(r.cp, 10) || 0;
    return {
      day: r.day,
      promptTokens: pt,
      completionTokens: ct,
      cachedPromptTokens: cp,
      totalTokens: tt,
      costUsd: parseFloat(r.cost ?? "0") || 0,
    };
  });
}

export type VipAccountPublic = {
  id: string;
  username: string;
  enabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export async function listVipAccounts(): Promise<VipAccountPublic[]> {
  const p = getPoolOrNull();
  if (!p) return [];
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    username: string;
    enabled: boolean;
    must_change_password: boolean;
    created_at: Date | string;
  }>(`SELECT id, username, enabled, must_change_password, created_at FROM vip_accounts ORDER BY created_at ASC`);
  return rows.map((r) => ({
    id: String(r.id),
    username: r.username,
    enabled: r.enabled,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function getVipByUsernameForAuth(
  username: string,
): Promise<{ id: string; username: string; passwordHash: string; enabled: boolean; mustChangePassword: boolean; createdAt: string } | null> {
  const p = getPoolOrNull();
  if (!p) return null;
  await ensureSchema();
  const u = username.trim().toLowerCase();
  if (!u) return null;
  const { rows } = await p.query<{
    id: string;
    username: string;
    password_hash: string;
    enabled: boolean;
    must_change_password: boolean;
    created_at: Date | string;
  }>(
    `SELECT id, username, password_hash, enabled, must_change_password, created_at FROM vip_accounts WHERE lower(username) = $1 LIMIT 1`,
    [u],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    username: r.username,
    passwordHash: r.password_hash,
    enabled: r.enabled,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function getVipAccountById(id: string): Promise<VipAccountPublic | null> {
  const p = getPoolOrNull();
  if (!p) return null;
  await ensureSchema();
  const { rows } = await p.query<{
    id: string;
    username: string;
    enabled: boolean;
    must_change_password: boolean;
    created_at: Date | string;
  }>(`SELECT id, username, enabled, must_change_password, created_at FROM vip_accounts WHERE id = $1::uuid LIMIT 1`, [id]);
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    username: r.username,
    enabled: r.enabled,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function createVipAccountRow(username: string, passwordHash: string): Promise<string> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  const u = username.trim().toLowerCase();
  if (!u || u.length < 2) throw new Error("invalid_username");
  const { rows } = await p.query<{ id: string }>(
    `INSERT INTO vip_accounts (username, password_hash) VALUES ($1, $2) RETURNING id::text AS id`,
    [u.slice(0, 64), passwordHash],
  );
  return rows[0]?.id ?? "";
}

export async function updateVipAccountRow(
  id: string,
  patch: { passwordHash?: string; enabled?: boolean; mustChangePassword?: boolean },
): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  if (patch.passwordHash != null) {
    await p.query(`UPDATE vip_accounts SET password_hash = $2, must_change_password = TRUE WHERE id = $1::uuid`, [id, patch.passwordHash]);
  }
  if (typeof patch.enabled === "boolean") {
    await p.query(`UPDATE vip_accounts SET enabled = $2 WHERE id = $1::uuid`, [id, patch.enabled]);
  }
  if (typeof patch.mustChangePassword === "boolean") {
    await p.query(`UPDATE vip_accounts SET must_change_password = $2 WHERE id = $1::uuid`, [id, patch.mustChangePassword]);
  }
}

export async function deleteVipAccountRow(id: string): Promise<void> {
  const p = getPoolOrNull();
  if (!p) throw new Error("db_not_configured");
  await ensureSchema();
  await p.query(`DELETE FROM vip_accounts WHERE id = $1::uuid`, [id]);
}
