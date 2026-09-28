import { redirect } from "next/navigation";
import { ChangePasswordForm } from "../../src/components/auth/change-password-form";
import { getCurrentUser } from "../../src/modules/auth/session";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return (
    <main className="auth-page">
      <section className="auth-card auth-card-wide">
        <div className="auth-brand"><span className="brand-mark">O</span><span>OfferTrack</span></div>
        <span className="eyebrow">Account Security</span>
        <h1>修改密码</h1>
        <p>{user.displayName}，新密码保存后，其他已登录设备会自动退出。</p>
        <ChangePasswordForm forced={user.mustChangePassword} />
      </section>
    </main>
  );
}
