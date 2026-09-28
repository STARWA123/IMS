import { NextResponse } from "next/server";
import {
  authenticateUser,
  InvalidCredentialsError,
} from "../../../../src/modules/auth/auth-service";
import { assertSameOrigin, ForbiddenError } from "../../../../src/modules/auth/authorization";
import {
  assertLoginAllowed,
  clearLoginFailures,
  LoginRateLimitError,
  recordLoginFailure,
} from "../../../../src/modules/auth/login-rate-limit";
import { createSession } from "../../../../src/modules/auth/session";

export const runtime = "nodejs";

function requestKey(request: Request, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwardedFor ?? "unknown"}:${username.trim().toLocaleLowerCase("en-US")}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.username !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "请输入账号和密码。" }, { status: 400 });
    }
    const key = requestKey(request, body.username);
    assertLoginAllowed(key);
    try {
      const user = await authenticateUser(body.username, body.password);
      clearLoginFailures(key);
      await createSession(user.id);
      return NextResponse.json({
        user: {
          username: user.username,
          displayName: user.displayName,
          mustChangePassword: user.mustChangePassword,
        },
      });
    } catch (error: unknown) {
      if (error instanceof InvalidCredentialsError) {
        recordLoginFailure(key);
      }
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof LoginRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "请求内容格式不正确。" }, { status: 400 });
    }
    throw error;
  }
}
