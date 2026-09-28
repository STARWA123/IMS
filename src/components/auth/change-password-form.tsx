"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { readApiError } from "../shared/api-client";

export function ChangePasswordForm({ forced }: { forced: boolean }): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setError("两次输入的新密码不一致。");
      setSubmitting(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      window.location.assign("/");
    } catch (changeError: unknown) {
      setError(changeError instanceof Error ? changeError.message : "密码修改失败。");
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {forced ? (
        <div className="auth-notice">管理员为你设置的是临时密码，继续使用前请更换密码。</div>
      ) : null}
      <label>
        当前密码
        <input autoComplete="current-password" disabled={submitting} name="currentPassword" required type="password" />
      </label>
      <label>
        新密码
        <input autoComplete="new-password" disabled={submitting} minLength={12} name="newPassword" required type="password" />
        <small>至少 12 位，同时包含字母和数字。</small>
      </label>
      <label>
        再次输入新密码
        <input autoComplete="new-password" disabled={submitting} minLength={12} name="confirmation" required type="password" />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button auth-submit" disabled={submitting} type="submit">
        {submitting ? "正在保存…" : "保存新密码"}
      </button>
      {!forced ? <a className="auth-back-link" href="/">返回 OfferTrack</a> : null}
    </form>
  );
}
