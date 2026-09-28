export async function readApiError(
  response: Response,
  fallback = "操作失败，请稍后重试。",
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  return typeof body?.error === "string" && body.error.trim()
    ? body.error
    : fallback;
}
