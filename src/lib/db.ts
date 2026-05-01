import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Article } from "./types";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "reading-plan.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
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
      knowledge_tags TEXT NOT NULL,
      status TEXT NOT NULL,
      added_at TEXT NOT NULL,
      due_date TEXT NOT NULL,
      completed_at TEXT,
      raw_excerpt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_articles_due_date ON articles(due_date);
    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
    CREATE INDEX IF NOT EXISTS idx_articles_completed_at ON articles(completed_at);
  `);
  dbInstance = db;
  return db;
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
  knowledge_tags: string;
  status: string;
  added_at: string;
  due_date: string;
  completed_at: string | null;
  raw_excerpt: string;
}

function rowToArticle(row: ArticleRow): Article {
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
    knowledgeTags: JSON.parse(row.knowledge_tags || "[]"),
    status: row.status as Article["status"],
    addedAt: row.added_at,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    rawExcerpt: row.raw_excerpt,
  };
}

export function insertArticle(article: Article): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO articles (
      id, url, title, domain, theme, summary, language, char_count, word_count,
      estimated_minutes, recommended_depth, knowledge_tags, status, added_at, due_date,
      completed_at, raw_excerpt
    ) VALUES (
      @id, @url, @title, @domain, @theme, @summary, @language, @charCount, @wordCount,
      @estimatedMinutes, @recommendedDepth, @knowledgeTags, @status, @addedAt, @dueDate,
      @completedAt, @rawExcerpt
    )`,
  ).run({
    ...article,
    knowledgeTags: JSON.stringify(article.knowledgeTags),
  });
}

export function updateArticle(article: Article): void {
  const db = getDb();
  db.prepare(
    `UPDATE articles SET
      title = @title,
      theme = @theme,
      summary = @summary,
      language = @language,
      char_count = @charCount,
      word_count = @wordCount,
      estimated_minutes = @estimatedMinutes,
      recommended_depth = @recommendedDepth,
      knowledge_tags = @knowledgeTags,
      status = @status,
      due_date = @dueDate,
      completed_at = @completedAt,
      raw_excerpt = @rawExcerpt
    WHERE id = @id`,
  ).run({
    ...article,
    knowledgeTags: JSON.stringify(article.knowledgeTags),
  });
}

export function listArticles(): Article[] {
  const rows = getDb()
    .prepare("SELECT * FROM articles ORDER BY due_date ASC, added_at DESC")
    .all() as ArticleRow[];
  return rows.map(rowToArticle);
}

export function getArticle(id: string): Article | null {
  const row = getDb().prepare("SELECT * FROM articles WHERE id = ?").get(id) as ArticleRow | undefined;
  return row ? rowToArticle(row) : null;
}

export function deleteArticle(id: string): void {
  getDb().prepare("DELETE FROM articles WHERE id = ?").run(id);
}

export function listCompletedBetween(startIso: string, endIso: string): Article[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM articles WHERE status = 'done' AND completed_at >= ? AND completed_at < ? ORDER BY completed_at DESC",
    )
    .all(startIso, endIso) as ArticleRow[];
  return rows.map(rowToArticle);
}
