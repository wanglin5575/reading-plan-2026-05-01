/** 避免末尾斜杠或空格导致请求路径变成 //auth/v1/... 触发网关报错 */
export function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
