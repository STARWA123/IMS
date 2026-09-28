"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { readApiError } from "../shared/api-client";

export function LoginForm(): ReactNode {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
      const body = (await response.json()) as {
        user: { mustChangePassword: boolean };
      };
      window.location.assign(body.user.mustChangePassword ? "/change-password" : "/");
    } catch (loginError: unknown) {
      setError(loginError instanceof Error ? loginError.message : "登录失败。");
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        账号
        <input
          autoCapitalize="none"
          autoComplete="username"
          autoFocus
          disabled={submitting}
          name="username"
          required
        />
      </label>
      <label>
        密码
        <input
          autoComplete="current-password"
          disabled={submitting}
          name="password"
          required
          type="password"
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-button auth-submit" disabled={submitting} type="submit">
        {submitting ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
