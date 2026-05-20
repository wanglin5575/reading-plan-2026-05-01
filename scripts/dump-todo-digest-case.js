#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const TODO_DIGEST_MAX_CHARS = 1000;
const MEDIA = { article: "文章", video: "视频", audio: "音频" };

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    out[key] = val.replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function getDbUrl() {
  const local = parseEnvFile(path.join(process.cwd(), ".env.local"));
  const merged = { ...local, ...process.env };
  return merged.DATABASE_URL || merged.POSTGRES_URL || merged.POSTGRES_PRISMA_URL || merged.SUPABASE_DB_URL || "";
}

function buildPurposeBlock(p) {
  const parts = [];
  if (p.reading_role?.trim()) parts.push(`职业/角色：${p.reading_role.trim()}`);
  if (p.reading_duties?.trim()) parts.push(`工作职责：${p.reading_duties.trim()}`);
  if (p.reading_goal?.trim()) parts.push(`希望通过阅读实现：${p.reading_goal.trim()}`);
  if (p.reading_prompt_extra?.trim()) parts.push(`补充说明：${p.reading_prompt_extra.trim()}`);
  return parts.length ? parts.join("\n") : "（用户未填写阅读目的，请仅根据待读列表提炼最值得关注的共性信息。）";
}

function compactArticleLine(a, index, tight) {
  const kind = MEDIA[a.media_type] || "文章";
  const title = (a.title_zh?.trim() || a.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const theme = (a.theme || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const sum = (a.summary || "").replace(/\s+/g, " ").trim().slice(0, tight ? 160 : 320);
  const ex = (a.raw_excerpt || "").replace(/\s+/g, " ").trim().slice(0, tight ? 140 : 260);
  return `${index + 1}. [${kind}] ${title}${theme ? ` · 主题「${theme}」` : ""}\n   摘要：${sum || "（无）"}\n   节选：${ex || "（无）"}`;
}

function buildSystemText(mode) {
  const systemBase = `你是阅读计划助手。用户有一份「待读」清单（可能包含文章、视频、音频类素材的摘要与节选）。
输出为简体中文纯文本：全文不超过 ${TODO_DIGEST_MAX_CHARS} 个汉字（含标点），不要输出链接；不要复述用户固定背景原文。
收束规则（极重要）：必须在**完整句子**处结束（以。！？等结尾），禁止在词语、英文单词、书名号或「第N条…」标题写到一半时停笔；若接近字数上限，应提前收束或压缩前文，而不是硬写到一半截断。
写作要求：在字数上限内做到**内容完整、逻辑连贯、有信息深度**——讲清「待读库在说什么、彼此如何关联、对用户目标意味着什么、建议优先关注什么」；避免空话套话、标题堆砌、只列书名式罗列或浅层概括。可用 2～4 个自然段组织，段内因果/递进清晰。`;
  const systemStyle =
    mode === "incremental"
      ? `你已收到「上一版待读摘要」与「新增条目」。请将新增条目的关键信息**有机融入**全文：可改写、合并、删繁就简；不要简单拼接两段；更新后仍须满足上述完整性与深度要求。`
      : `请根据用户的职业背景、职责与阅读目的，判断当前待读库中**最值得关注或优先处理**的信息并写成摘要。
若存在「本次单次附加要求」，须优先满足，同时保持整体完整、有逻辑、有深度。`;
  return `${systemBase}\n${systemStyle}`;
}

function buildUserBundle(profile, todos, mode, previousDigest, oneTimeExtra) {
  const purpose = buildPurposeBlock(profile);
  const maxItems = 60;
  const slice = todos.slice(0, maxItems);
  const tight = mode === "incremental";
  const lines = slice.map((a, i) => compactArticleLine(a, i, tight)).join("\n\n");
  const extraBlock =
    mode === "full" && oneTimeExtra?.trim()
      ? `【本次单次附加要求（仅此一轮，优先满足；勿与下方固定背景重复）】\n${oneTimeExtra.trim().slice(0, 800)}\n\n`
      : "";
  const listSection =
    mode === "incremental"
      ? `【自上次摘要生成以来新加入的待读条目】\n${lines || "（无）"}`
      : `【待读清单（含文章/视频/音频的摘要与节选）】\n${lines}`;
  const prevBlock =
    mode === "incremental" && previousDigest?.trim()
      ? `【上一版待读摘要（请有机融入新增要点，勿逐句复述，可改写压缩）】\n${previousDigest.trim().slice(0, TODO_DIGEST_MAX_CHARS)}\n\n`
      : "";
  return `【用户阅读目的与背景】\n${purpose}\n\n${extraBlock}${prevBlock}${listSection}`.slice(0, 12000);
}

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***" : "";
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

async function main() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    console.error("No DATABASE_URL in .env.local");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl, ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false } });

  const { rows: profiles } = await pool.query(`
    SELECT up.user_id, up.todo_digest, up.todo_digest_at,
           up.reading_role, up.reading_duties, up.reading_goal, up.reading_prompt_extra,
           ur.email
    FROM user_profiles up
    LEFT JOIN app_user_registry ur ON ur.user_id = up.user_id
    WHERE COALESCE(TRIM(up.todo_digest), '') <> ''
    ORDER BY up.todo_digest_at DESC NULLS LAST
    LIMIT 5
  `);

  if (!profiles.length) {
    console.error("No todo_digest rows found");
    await pool.end();
    process.exit(1);
  }

  const p = profiles[0];
  const digestAt = p.todo_digest_at ? new Date(p.todo_digest_at) : null;
  const digestAtMs = digestAt && Number.isFinite(digestAt.getTime()) ? digestAt.getTime() : 0;

  const { rows: todos } = await pool.query(
    `SELECT id, title, title_zh, theme, summary, raw_excerpt, media_type, status, added_at
     FROM articles WHERE user_id = $1 AND status = 'todo'
     ORDER BY due_date ASC, added_at DESC`,
    [p.user_id],
  );

  const todosAtGen = digestAtMs
    ? todos.filter((a) => {
        const t = new Date(a.added_at).getTime();
        return !Number.isFinite(t) || t <= digestAtMs + 60_000;
      })
    : todos;

  const newSinceDigest = digestAtMs
    ? todos.filter((a) => {
        const t = new Date(a.added_at).getTime();
        return Number.isFinite(t) && t > digestAtMs;
      })
    : [];

  const { rows: tokenRows } = await pool.query(
    `SELECT source, prompt_tokens, completion_tokens, total_tokens, created_at
     FROM token_usage_log
     WHERE user_id = $1 AND source = 'todo_digest'
     ORDER BY created_at DESC
     LIMIT 5`,
    [p.user_id],
  );

  const incrementalCandidates = digestAtMs
    ? todosAtGen.filter((a) => {
        const t = new Date(a.added_at).getTime();
        return Number.isFinite(t) && t > digestAtMs - 7 * 24 * 3600 * 1000 && t <= digestAtMs;
      })
    : [];

  const outDir = path.join(process.cwd(), "data", "debug");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "todo-digest-last-case.txt");

  const lines = [];
  lines.push("=== 待读摘要最近一次生成 Case（从数据库还原）===");
  lines.push("");
  lines.push("说明：");
  lines.push("- **输出**：来自 user_profiles.todo_digest（即当时写入页面的最终文本，可能已 clamp）");
  lines.push("- **输入**：系统未落库；此处按 generateTodoDigest 逻辑 **还原**，非 API 原始字节流");
  lines.push("- **模式**：请求体未存；下面给出 full / incremental 两种最可能还原（请对照 token 与时间判断）");
  lines.push("");
  lines.push("--- 元数据 ---");
  lines.push(`user_id: ${p.user_id}`);
  lines.push(`email: ${maskEmail(p.email)}`);
  lines.push(`todo_digest_at: ${digestAt ? digestAt.toISOString() : "(null)"}`);
  lines.push(`stored_output_chars: ${Array.from(String(p.todo_digest || "").trim()).length}`);
  lines.push(`todo_count_now: ${todos.length}`);
  lines.push(`todo_count_at_or_before_digest: ${todosAtGen.length}`);
  lines.push(`todos_added_after_digest: ${newSinceDigest.length}`);
  if (tokenRows[0]) {
    const t = tokenRows[0];
    lines.push(
      `latest_token_log: ${t.created_at} | prompt=${t.prompt_tokens} completion=${t.completion_tokens} total=${t.total_tokens}`,
    );
  } else {
    lines.push("latest_token_log: (none)");
  }
  lines.push("");
  lines.push("--- 输出（DB 存的全文）---");
  lines.push(String(p.todo_digest || "").trim());
  lines.push("");
  lines.push("--- 输出末尾 120 字（便于核对截断）---");
  const outText = String(p.todo_digest || "").trim();
  lines.push(outText.slice(-120));
  lines.push("");

  for (const mode of ["full", "incremental"]) {
    const prev = mode === "incremental" ? "(上一版摘要未单独存档，增量模式无法 100% 还原 prevBlock)" : undefined;
    const useTodos = mode === "incremental" ? incrementalCandidates : todosAtGen;
    lines.push(`========== 还原输入 · 模式=${mode} · 条目数=${useTodos.length} ==========`);
    lines.push("");
    lines.push("--- system ---");
    lines.push(buildSystemText(mode));
    lines.push("");
    lines.push("--- user ---");
    lines.push(buildUserBundle(p, useTodos, mode, prev, ""));
    lines.push("");
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(outPath);
  console.log(`chars_output=${Array.from(outText).length} todos_at_gen=${todosAtGen.length}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
