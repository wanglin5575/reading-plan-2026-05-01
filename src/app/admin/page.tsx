import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getServerAuthUser } from "@/lib/auth/server";
import AdminDashboardClient from "@/components/AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getServerAuthUser();
  if (!user?.email) {
    redirect("/me");
  }
  if (!isAdminEmail(user.email)) {
    redirect("/weekly");
  }

  return <AdminDashboardClient isAdmin />;
}
