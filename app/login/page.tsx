import { redirect } from "next/navigation";
import { LoginForm } from "../../src/components/auth/login-form";
import { getCurrentUser } from "../../src/modules/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(user.mustChangePassword ? "/change-password" : "/");
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark">O</span><span>OfferTrack</span></div>
        <span className="eyebrow">Private Workspace</span>
        <h1>欢迎回来</h1>
        <p>使用管理员分配的账号登录你的招聘信息空间。</p>
        <LoginForm />
      </section>
    </main>
  );
}
