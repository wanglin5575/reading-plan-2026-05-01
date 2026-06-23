/**
 * 把模型偶尔输出的 Markdown 清洗成「结构化纯文本」用于展示。
 * 目标：去掉 #、*、**、|、---、>、` 等标记符号与表格管线，
 * 但尽量保留分段/小标题/条目这样的结构（用换行与「· 」等可读形式）。
 * 仅用于 AI 真实返回内容的展示净化，不做字数截断。
 */

function isTableSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** 行内标记清理：粗体/斜体/行内代码/链接 */
function stripInline(s: string): string {
  let t = s;
  // 链接 [text](url) -> text
  t = t.replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1");
  // 图片 ![alt](url) -> alt
  t = t.replace(/!\[([^\]]*)\]\((?:[^)]*)\)/g, "$1");
  // 行内代码 `code` -> code
  t = t.replace(/`([^`]+)`/g, "$1");
  // 粗体/斜体
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/\*([^*\n]+)\*/g, "$1");
  t = t.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, "$1$2");
  // 残留的成对/零散星号
  t = t.replace(/\*\*/g, "").replace(/\*/g, "");
  return t;
}

export function stripMarkdownToPlainText(input: string): string {
  if (!input) return "";
  const rawLines = input.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (const raw of rawLines) {
    let line = raw.replace(/\s+$/g, "");

    // 水平分隔线 ---、***、___ -> 空行
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push("");
      continue;
    }

    // 表格行（含管线）
    const trimmed = line.trim();
    if (trimmed.includes("|") && (/^\|/.test(trimmed) || /\|.*\|/.test(trimmed))) {
      const cells = splitTableRow(trimmed).filter((c) => c.length > 0);
      if (isTableSeparatorRow(splitTableRow(trimmed))) {
        continue; // 丢弃 |---|---| 分隔行
      }
      if (cells.length > 0) {
        const joined = cells.map((c) => stripInline(c)).join("　");
        out.push(joined.trim());
        continue;
      }
    }

    // 标题 #### -> 去掉井号，保留文字作为一行小标题
    line = line.replace(/^\s*#{1,6}\s*/, "");
    // 引用 > -> 去掉
    line = line.replace(/^\s*>\s?/, "");
    // 无序列表 -、*、+ -> 「· 」
    line = line.replace(/^(\s*)[-*+]\s+/, "$1· ");

    line = stripInline(line);
    out.push(line);
  }

  // 合并多余空行（最多保留一个空行作为分段）
  const collapsed: string[] = [];
  for (const l of out) {
    const isBlank = l.trim() === "";
    if (isBlank && collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === "") {
      continue;
    }
    collapsed.push(l);
  }

  return collapsed.join("\n").replace(/^\n+/, "").replace(/\n+$/, "").trim();
}
