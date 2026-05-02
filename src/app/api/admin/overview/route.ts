import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { buildAdminOverview } from "@/lib/admin-overview";
import { getRouteHandlerUser } from "@/lib/auth/api";
import { isDatabaseConfigured } from "@/lib/db";
import { listAllSupabaseAuthUsers } from "@/lib/supabase/admin-users";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getRouteHandlerUser();
  if (!session?.email || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const authUsers = await listAllSupabaseAuthUsers();
  const overview = await buildAdminOverview({ authUsers });

  return NextResponse.json({
    ...overview,
    meta: {
      ...overview.meta,
      serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      databaseConfigured: isDatabaseConfigured(),
    },
  });
}
