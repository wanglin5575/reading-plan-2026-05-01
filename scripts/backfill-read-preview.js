#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
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
  return (
    merged.DATABASE_URL ||
    merged.POSTGRES_URL ||
    merged.POSTGRES_PRISMA_URL ||
    merged.SUPABASE_DB_URL ||
    ""
  );
}

function normalizeEmailForAdminMatch(email) {
  const trimmed = String(email || "").trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
  }
  return `${local}@${domain}`;
}

function parseArgs(argv) {
  const out = {
    scope: "vienna",
    apply: false,
    email: "vienna.wwl@gmail.com",
    limitUsers: 0,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--dry-run") out.apply = false;
    else if (a === "--scope" && argv[i + 1]) out.scope = argv[++i];
    else if (a === "--email" && argv[i + 1]) out.email = argv[++i];
    else if (a === "--limit-users" && argv[i + 1]) out.limitUsers = Number(argv[++i]) || 0;
  }
  return out;
}

async function loadScopeUserIds(pool, scope, email) {
  if (scope === "all") {
    const { rows } = await pool.query(
      `SELECT DISTINCT user_id::text AS user_id
       FROM token_usage_log
       WHERE source='read_preview' AND browse_topic_id IS NULL`,
    );
    return rows.map((r) => r.user_id);
  }
  const targetNorm = normalizeEmailForAdminMatch(email);
  const { rows } = await pool.query(
    `SELECT DISTINCT user_id::text AS user_id, email
     FROM app_user_registry`,
  );
  return rows
    .filter((r) => normalizeEmailForAdminMatch(r.email) === targetNorm)
    .map((r) => r.user_id);
}

async function main() {
  const args = parseArgs(process.argv);
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    console.error("ERROR: missing DB url (DATABASE_URL/POSTGRES_URL/SUPABASE_DB_URL).");
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    const scopeUserIds = await loadScopeUserIds(pool, args.scope, args.email);
    const scoped = args.limitUsers > 0 ? scopeUserIds.slice(0, args.limitUsers) : scopeUserIds;
    if (!scoped.length) {
      console.log(JSON.stringify({ status: "no_scope_users", scope: args.scope, email: args.email }, null, 2));
      return;
    }

    const { rows: topicRows } = await pool.query(
      `SELECT user_id::text AS user_id, id::text AS topic_id
       FROM browse_topics
       WHERE user_id = ANY($1::text[])`,
      [scoped],
    );
    const topicsByUser = new Map();
    for (const r of topicRows) {
      if (!topicsByUser.has(r.user_id)) topicsByUser.set(r.user_id, []);
      topicsByUser.get(r.user_id).push(r.topic_id);
    }

    const { rows: candidateRows } = await pool.query(
      `SELECT id::text AS id, user_id::text AS user_id
       FROM token_usage_log
       WHERE source='read_preview'
         AND browse_topic_id IS NULL
         AND user_id = ANY($1::text[])`,
      [scoped],
    );

    const reasonCounts = {
      multi_topic: 0,
      no_topic: 0,
    };
    const matchByTopic = new Map();
    for (const row of candidateRows) {
      const topics = topicsByUser.get(row.user_id) || [];
      if (topics.length !== 1) {
        if (topics.length === 0) reasonCounts.no_topic++;
        else reasonCounts.multi_topic++;
        continue;
      }
      const topicId = topics[0];
      if (!matchByTopic.has(topicId)) matchByTopic.set(topicId, []);
      matchByTopic.get(topicId).push(row.id);
    }

    let updated = 0;
    if (args.apply) {
      await pool.query("BEGIN");
      for (const [topicId, ids] of matchByTopic.entries()) {
        const { rowCount } = await pool.query(
          `UPDATE token_usage_log
           SET browse_topic_id = $2
           WHERE id = ANY($1::uuid[])
             AND source='read_preview'
             AND browse_topic_id IS NULL`,
          [ids, topicId],
        );
        updated += rowCount || 0;
      }
      await pool.query("COMMIT");
    }

    const { rows: afterRows } = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM token_usage_log
       WHERE source='read_preview'
         AND browse_topic_id IS NULL
         AND user_id = ANY($1::text[])`,
      [scoped],
    );
    const stillUnassigned = afterRows[0] ? afterRows[0].c : 0;

    const summary = {
      mode: args.apply ? "apply" : "dry-run",
      scope: args.scope,
      scopedUsers: scoped.length,
      candidateRows: candidateRows.length,
      matchedRows: Array.from(matchByTopic.values()).reduce((s, arr) => s + arr.length, 0),
      updatedRows: updated,
      unmatchedRows: args.apply ? stillUnassigned : candidateRows.length - Array.from(matchByTopic.values()).reduce((s, arr) => s + arr.length, 0),
      unmatchedTopReasons: reasonCounts,
      note: "Conservative rule: only user with exactly one browse topic can be backfilled.",
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

