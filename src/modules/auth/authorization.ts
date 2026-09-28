import "server-only";

import { db } from "../../db/client";
import type { AuthUser } from "./auth-types";
import { getCurrentUser } from "./session";

export class UnauthorizedError extends Error {
  constructor() {
    super("请先登录。");
    this.name = "UnauthorizedError";
  }
}
export class ForbiddenError extends Error {
  constructor(message = "没有执行该操作的权限。") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireUser(options?: {
  allowPasswordChangeRequired?: boolean;
}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  if (user.mustChangePassword && !options?.allowPasswordChangeRequired) {
    throw new ForbiddenError("请先修改临时密码。");
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new ForbiddenError();
  }
  return user;
}

export async function requireWorkspaceOwner(
  userId: string,
  workspaceId: string,
): Promise<void> {
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, ownerId: userId },
    select: { id: true },
  });
  if (!workspace) {
    throw new ForbiddenError("Workspace 不存在或不属于当前账号。");
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) {
    throw new ForbiddenError("无法验证请求来源。");
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("请求来源无效。");
  }
  if (originHost !== host) {
    throw new ForbiddenError("拒绝跨站请求。");
  }
}
