"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { AuthUser, ManagedUser } from "../../modules/auth/auth-types";
import { readApiError } from "../shared/api-client";
import { DialogShell } from "../shared/dialog-shell";

function ResetPasswordDialog({
  user,
  onClose,
  onReset,
}: {
  user: ManagedUser;
  onClose: () => void;
  onReset: () => void;
}): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      onReset();
    } catch (resetError: unknown) {
      setError(resetError instanceof Error ? resetError.message : "密码重置失败。");
      setSubmitting(false);
    }
  }

  return (
    <DialogShell
      closeDisabled={submitting}
      description={`为 ${user.displayName} 设置一次性临时密码。`}
      onClose={onClose}
      title="重置账号密码"
    >
      <form className="workspace-form" onSubmit={submit}>
        <label>
          临时密码
          <input autoComplete="new-password" disabled={submitting} minLength={12} name="password" required type="password" />
          <em>至少 12 位，同时包含字母和数字；用户下次登录时必须修改。</em>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={submitting} onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={submitting} type="submit">{submitting ? "正在重置…" : "确认重置"}</button>
        </div>
      </form>
    </DialogShell>
  );
}
function AdminUserManagement({ currentUser }: { currentUser: AuthUser }): ReactNode {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);

  async function loadUsers(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as { users: ManagedUser[] };
      setUsers(body.users);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "账号列表加载失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          displayName: form.get("displayName"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as { user: ManagedUser };
      setUsers((items) => [...items, body.user]);
      setMessage(`账号 @${body.user.username} 已创建。`);
      formElement.reset();
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "账号创建失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleUser(user: ManagedUser): Promise<void> {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as { user: ManagedUser };
      setUsers((items) => items.map((item) => item.id === body.user.id ? body.user : item));
      setMessage(`${body.user.displayName} 已${body.user.isActive ? "启用" : "停用"}。`);
    } catch (toggleError: unknown) {
      setError(toggleError instanceof Error ? toggleError.message : "账号状态更新失败。");
    }
  }

  return (
    <section className="content-card account-admin-section">
      <div className="settings-section-copy">
        <span className="eyebrow">Administrator</span>
        <h2>团队账号</h2>
        <p>管理员创建账号和临时密码；每个新账号自动获得独立个人空间。</p>
      </div>

      <form className="account-create-form" onSubmit={createUser}>
        <label>账号<input autoCapitalize="none" disabled={submitting} name="username" placeholder="例如 zhangsan" required /></label>
        <label>显示名称<input disabled={submitting} name="displayName" placeholder="例如 张三" required /></label>
        <label>临时密码<input autoComplete="new-password" disabled={submitting} minLength={12} name="password" required type="password" /></label>
        <button className="primary-button" disabled={submitting} type="submit">{submitting ? "正在创建…" : "创建账号"}</button>
      </form>

      {message ? <p className="settings-success" role="status">{message}</p> : null}
      {error ? <p className="form-error account-form-error" role="alert">{error}</p> : null}

      <div className="account-table-wrap">
        <table>
          <thead><tr><th>账号</th><th>角色</th><th>状态</th><th>密码状态</th><th>操作</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5}>正在加载账号…</td></tr> : users.map((user) => (
              <tr key={user.id}>
                <td><strong>{user.displayName}</strong><small>@{user.username}</small></td>
                <td>{user.role === "ADMIN" ? "管理员" : "成员"}</td>
                <td><span className={user.isActive ? "account-status active" : "account-status"}>{user.isActive ? "已启用" : "已停用"}</span></td>
                <td>{user.mustChangePassword ? "等待用户修改" : "正常"}</td>
                <td className="account-actions">
                  <button onClick={() => setResetUser(user)} type="button">重置密码</button>
                  {user.role !== "ADMIN" ? <button className={user.isActive ? "danger-text-button" : ""} onClick={() => void toggleUser(user)} type="button">{user.isActive ? "停用" : "启用"}</button> : null}
                  {user.id === currentUser.id ? <span>当前账号</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetUser ? (
        <ResetPasswordDialog
          onClose={() => setResetUser(null)}
          onReset={() => {
            setMessage(`${resetUser.displayName} 的临时密码已更新。`);
            setUsers((items) => items.map((item) => item.id === resetUser.id ? { ...item, mustChangePassword: true } : item));
            setResetUser(null);
          }}
          user={resetUser}
        />
      ) : null}
    </section>
  );
}

export function AccountSettings({ currentUser }: { currentUser: AuthUser }): ReactNode {
  return (
    <>
      <section className="content-card settings-section">
        <div className="settings-section-copy">
          <span className="eyebrow">Account</span>
          <h2>{currentUser.displayName}</h2>
          <p>@{currentUser.username} · {currentUser.role === "ADMIN" ? "管理员" : "成员"}</p>
        </div>
        <a className="secondary-button settings-action" href="/change-password">修改密码</a>
      </section>
      {currentUser.role === "ADMIN" ? <AdminUserManagement currentUser={currentUser} /> : null}
    </>
  );
}
