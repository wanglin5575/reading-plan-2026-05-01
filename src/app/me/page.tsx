import { isAuthEnabled } from "@/lib/auth";
import { getServerAuthUser } from "@/lib/auth/server";
import { MeAccountClient } from "@/components/MeAccountClient";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getServerAuthUser();

  return (
    <>
      <header className="app-header">
        <h1>我的</h1>
        <span className="sub">账号与数据归属</span>
      </header>

      <MeAccountClient authEnabled={isAuthEnabled()} initialEmail={user?.email ?? null} />
    </>
  );
}
