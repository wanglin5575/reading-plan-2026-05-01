/**
 * 根据 URL 给出发布位置/平台展示名（筛除记录等场景）。
 */
export function publicationSourceLabelFromUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.replace(/^www\./, "").toLowerCase();

    if (h === "youtu.be" || h.endsWith("youtube.com")) return "YouTube";
    if (h.endsWith("linkedin.com")) return "LinkedIn";
    if (h === "x.com" || h.endsWith("twitter.com")) return "X（Twitter）";
    if (h.endsWith("medium.com")) return "Medium";
    if (h.endsWith("substack.com")) return "Substack";
    if (h.endsWith("github.com")) return "GitHub";
    if (h.endsWith("reddit.com")) return "Reddit";
    if (h.endsWith("facebook.com")) return "Facebook";
    if (h.endsWith("instagram.com")) return "Instagram";
    if (h.endsWith("tiktok.com")) return "TikTok";
    if (h.endsWith("bilibili.com")) return "哔哩哔哩";
    if (h.endsWith("xiaohongshu.com") || h.endsWith("xhslink.com")) return "小红书";
    if (h.endsWith("zhihu.com")) return "知乎";
    if (h.endsWith("weixin.qq.com") || h.endsWith("mp.weixin.qq.com")) return "微信公众号";

    return h || "网页";
  } catch {
    return "网页";
  }
}
