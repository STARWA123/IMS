import { NextResponse } from "next/server";
import {
  ManagedUserNotFoundError,
  resetManagedUserPassword,
  setManagedUserActive,
} from "../../../../../src/modules/auth/auth-service";
import {
  assertSameOrigin,
  ForbiddenError,
  requireAdmin,
} from "../../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../../src/modules/auth/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const administrator = await requireAdmin();
    const { userId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (typeof body.password === "string") {
      await resetManagedUserPassword(userId, body.password);
      return NextResponse.json({ success: true });
    }
    if (typeof body.isActive === "boolean") {
      if (userId === administrator.id && !body.isActive) {
        throw new ForbiddenError("不能停用当前登录的管理员账号。");
      }
      const user = await setManagedUserActive(userId, body.isActive);
      return NextResponse.json({ user });
    }
    return NextResponse.json({ error: "没有可更新的账号字段。" }, { status: 400 });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) {
      return response;
    }
    if (error instanceof ManagedUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
