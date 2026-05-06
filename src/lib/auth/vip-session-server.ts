import { cookies } from "next/headers";
import { getVipAccountById } from "@/lib/db";
import { verifyVipSessionToken, VIP_SESSION_COOKIE, vipSyntheticEmail } from "@/lib/vip-auth";

export type VipSessionUser = {
  id: string;
  email: string;
  createdAt: string | null;
  mustChangePassword: boolean;
};

/** 解析 VIP Cookie；会话有效且账号仍为启用时返回与 Supabase 对齐的字段（email 为合成邮箱） */
export async function tryReadVipSessionUser(): Promise<VipSessionUser | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(VIP_SESSION_COOKIE)?.value?.trim();
    if (!raw) return null;
    const tok = verifyVipSessionToken(raw);
    if (!tok) return null;
    const row = await getVipAccountById(tok.sub);
    if (!row?.enabled) return null;
    return {
      id: row.id,
      email: vipSyntheticEmail(row.username),
      createdAt: row.createdAt,
      mustChangePassword: row.mustChangePassword,
    };
  } catch {
    return null;
  }
}
