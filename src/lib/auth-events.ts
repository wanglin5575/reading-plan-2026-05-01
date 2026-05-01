/** 用于通知 Tabbar 等客户端组件刷新登录状态（与 pathname 变化无关时） */
export function dispatchAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("auth-changed"));
}
