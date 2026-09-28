import { NextResponse } from "next/server";
import { assertSameOrigin, ForbiddenError } from "../../../../src/modules/auth/authorization";
import { deleteCurrentSession } from "../../../../src/modules/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await deleteCurrentSession();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
