import "server-only";

const windowMilliseconds = 15 * 60 * 1000;
const maximumFailures = 5;

type FailureWindow = {
  failures: number;
  resetAt: number;
};

const globalForLoginRateLimit = globalThis as typeof globalThis & {
  offerTrackLoginFailures?: Map<string, FailureWindow>;
};

const failures =
  globalForLoginRateLimit.offerTrackLoginFailures ?? new Map<string, FailureWindow>();

if (process.env.NODE_ENV !== "production") {
  globalForLoginRateLimit.offerTrackLoginFailures = failures;
}

export class LoginRateLimitError extends Error {
  constructor(waitMinutes: number) {
    super(`登录失败次数过多，请在 ${waitMinutes} 分钟后重试。`);
    this.name = "LoginRateLimitError";
  }
}

export function assertLoginAllowed(key: string): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.delete(key);
    return;
  }
  if (entry.failures >= maximumFailures) {
    const waitMinutes = Math.max(1, Math.ceil((entry.resetAt - now) / 60_000));
    throw new LoginRateLimitError(waitMinutes);
  }
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { failures: 1, resetAt: now + windowMilliseconds });
    return;
  }
  entry.failures += 1;
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
