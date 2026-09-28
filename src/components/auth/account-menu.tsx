"use client";

import { useState, type ReactNode } from "react";
import type { AuthUser } from "../../modules/auth/auth-types";

export function AccountMenu({ user }: { user: AuthUser }): ReactNode {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout(): Promise<void> {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <div className="account-menu">
      <div className="account-identity">
        <span>{user.displayName.slice(0, 1).toLocaleUpperCase("zh-CN")}</span>
        <div><strong>{user.displayName}</strong><small>@{user.username}</small></div>
      </div>
      <button disabled={loggingOut} onClick={logout} type="button">
        {loggingOut ? "退出中…" : "退出"}
      </button>
    </div>
  );
}
