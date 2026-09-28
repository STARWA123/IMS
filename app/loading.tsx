import type { ReactNode } from "react";

export default function AppLoading(): ReactNode {
  return (
    <main className="route-state-shell">
      <section className="loading-state" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        正在启动 OfferTrack…
      </section>
    </main>
  );
}
