import { NextResponse } from "next/server";
import {
  changeOwnPassword,
  InvalidCredentialsError,
} from "../../../../src/modules/auth/auth-service";
import {
  assertSameOrigin,
  requireUser,
} from "../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../src/modules/auth/http";
import { createSession } from "../../../../src/modules/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const user = await requireUser({ allowPasswordChangeRequired: true });
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.currentPassword !== "string" ||
      typeof body.newPassword !== "string"
    ) {
      return NextResponse.json({ error: "密码信息格式无效。" }, { status: 400 });
    }
    await changeOwnPassword(user.id, body.currentPassword, body.newPassword);
    await createSession(user.id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const authResponse = authErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }
    if (error instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: "当前密码不正确。" }, { status: 400 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
