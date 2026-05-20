/** 用户是否刚选中了非空文本（折叠区：有选中时不触发折叠） */
export function hasActiveTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  return sel.toString().trim().length > 0;
}
