import { NextResponse } from "next/server";
import {
  createManagedUser,
  DuplicateUsernameError,
  listManagedUsers,
} from "../../../../src/modules/auth/auth-service";
import { assertSameOrigin, requireAdmin } from "../../../../src/modules/auth/authorization";
import { authErrorResponse } from "../../../../src/modules/auth/http";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await listManagedUsers() });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) {
      return response;
    }
    throw error;
  }
}
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.username !== "string" ||
      typeof body.displayName !== "string" ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json({ error: "账号信息格式无效。" }, { status: 400 });
    }
    const user = await createManagedUser({
      username: body.username,
      displayName: body.displayName,
      password: body.password,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error: unknown) {
    const response = authErrorResponse(error);
    if (response) {
      return response;
    }
    if (error instanceof DuplicateUsernameError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
