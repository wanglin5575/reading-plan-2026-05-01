import BrowsePageClient from "@/components/BrowsePageClient";
import { isAdminEmail } from "@/lib/admin";
import { getServerAuthUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function BrowsePage() {
  const user = await getServerAuthUser();
  return (
    <BrowsePageClient userEmail={user?.email ?? null} showAdmin={isAdminEmail(user?.email)} />
  );
}
