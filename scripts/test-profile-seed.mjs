import { readFileSync } from "fs";
import { resolve } from "path";
import FirecrawlApp from "@mendable/firecrawl-js";

try {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local */
}

const SEED = process.argv[2] || "https://xhslink.com/m/4jtRA9bzMwY";

async function resolveSeed(seed) {
  try {
    const h = new URL(seed).hostname.replace(/^www\./, "").toLowerCase();
    if (!/(^|\.)xhslink\.com$/.test(h)) return seed;
    const res = await fetch(seed, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });
    return res.url || seed;
  } catch {
    return seed;
  }
}

function extractXhsNotes(blob) {
  const re = /https?:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/[0-9a-zA-Z]+/gi;
  return [...new Set([...blob.matchAll(re)].map((m) => m[0]))];
}

async function main() {
  console.log("=== 种子 ===");
  console.log(SEED);

  const resolved = await resolveSeed(SEED);
  console.log("\n=== 解析后 URL ===");
  console.log(resolved);
  console.log("是否 profile:", /\/user\/profile\//i.test(resolved));

  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    console.log("\n未配置 FIRECRAWL_API_KEY");
    return;
  }

  const app = new FirecrawlApp({ apiKey });
  console.log("\n=== Firecrawl scrape 主页（滚动 + links）===");
  const t0 = Date.now();
  const doc = await app.scrape(resolved, {
    formats: ["links", "markdown", "rawHtml"],
    onlyMainContent: false,
    waitFor: 12000,
    mobile: true,
    proxy: "auto",
    actions: [
      { type: "wait", milliseconds: 6000 },
      ...Array.from({ length: 8 }, () => ({ type: "scroll", direction: "down" })),
      { type: "wait", milliseconds: 2000 },
    ],
  });

  const md = doc.markdown || "";
  const html = doc.rawHtml || doc.html || "";
  const links = doc.links || [];
  const notesFromLinks = links.filter((u) => /\/(?:explore|discovery\/item)\//i.test(u));
  const notesFromText = extractXhsNotes(`${md}\n${html}`);
  const allNotes = [...new Set([...notesFromLinks, ...notesFromText])];

  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("metadata.title:", doc.metadata?.title);
  console.log("links 总数:", links.length);
  console.log("笔记 URL 数:", allNotes.length);

  if (md) {
    console.log("\n=== markdown 前 600 字 ===");
    console.log(md.slice(0, 600));
  }

  if (allNotes.length) {
    console.log("\n=== 发现的笔记 ===");
    allNotes.slice(0, 10).forEach((u, i) => console.log(`${i + 1}. ${u}`));

    const sample = allNotes[0];
    console.log("\n=== 试抓第 1 条笔记 ===");
    const note = await app.scrape(sample, {
      formats: ["markdown"],
      onlyMainContent: false,
      waitFor: 10000,
      mobile: true,
      proxy: "auto",
    });
    console.log("标题:", note.metadata?.title);
    console.log("正文节选:", (note.markdown || "").slice(0, 400));
  } else {
    console.log("\n=== Firecrawl map 补试 ===");
    try {
      const mapped = await app.map(resolved, { limit: 50, includeSubdomains: true });
      const mapNotes = (mapped.links || [])
        .map((x) => x.url)
        .filter((u) => /\/(?:explore|discovery\/item)\//i.test(u));
      console.log("map 笔记数:", mapNotes.length);
      mapNotes.slice(0, 5).forEach((u, i) => console.log(`${i + 1}. ${u}`));
    } catch (e) {
      console.log("map 失败:", e instanceof Error ? e.message : e);
    }
    console.log("\n结论：主页未返回可抓笔记列表，多为小红书 Web 登录墙。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
