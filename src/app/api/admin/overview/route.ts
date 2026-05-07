import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { buildAdminOverview } from "@/lib/admin-overview";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { isDatabaseConfigured } from "@/lib/db";
import { listAllSupabaseAuthUsers } from "@/lib/supabase/admin-users";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getRouteHandlerUser();
  if (!session?.id || !session.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const viewerIsAdmin = isAdminEmail(session.email);
  const usageSelfOnly = new URL(req.url).searchParams.get("usageSelfOnly") === "1";
  const authUsers =
    viewerIsAdmin && !usageSelfOnly ? await listAllSupabaseAuthUsers() : [];

  const overview = await buildAdminOverview({
    authUsers,
    viewerUserId: session.id,
    viewerEmail: session.email,
    viewerIsAdmin,
    usageSelfOnly,
  });

  return NextResponse.json({
    ...overview,
    meta: viewerIsAdmin
      ? {
          ...overview.meta,
          serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
          databaseConfigured: isDatabaseConfigured(),
        }
      : {
          databaseConfigured: isDatabaseConfigured(),
        },
  });
}
