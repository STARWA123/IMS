"use client";

import { useEffect, type ReactNode } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="route-state-shell">
      <section className="error-state" role="alert">
        <span className="error-state-mark" aria-hidden="true">!</span>
        <h1>OfferTrack 暂时无法加载</h1>
        <p>本地数据没有被修改。请重试；若问题持续，请检查数据库初始化状态。</p>
        <button className="primary-button state-action" onClick={reset} type="button">重试</button>
      </section>
    </main>
  );
}
