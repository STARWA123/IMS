import type { UserRole } from "../../generated/prisma/client";
import { db } from "../../db/client";
import { DEFAULT_WORKSPACE_NAME } from "../../db/initialize-database";
import type { AuthUser, ManagedUser } from "./auth-types";
import { hashPassword, verifyPassword } from "./password";

const usernamePattern = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/;

export class InvalidCredentialsError extends Error {
  constructor() {
    super("账号或密码不正确。");
    this.name = "InvalidCredentialsError";
  }
}

export class DuplicateUsernameError extends Error {
  constructor() {
    super("该账号已经存在。");
    this.name = "DuplicateUsernameError";
  }
}

export class ManagedUserNotFoundError extends Error {
  constructor() {
    super("账号不存在。");
    this.name = "ManagedUserNotFoundError";
  }
}

export function normalizeUsername(username: string): string {
  const normalized = username.trim().toLocaleLowerCase("en-US");
  if (!usernamePattern.test(normalized)) {
    throw new TypeError("账号需为 3–32 位小写字母、数字、点、横线或下划线。");
  }
  return normalized;
}

export function normalizeDisplayName(displayName: string): string {
  const normalized = displayName.trim();
  if (!normalized || normalized.length > 50) {
    throw new TypeError("显示名称需为 1–50 个字符。");
  }
  return normalized;
}

function toAuthUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}): AuthUser {
  return { ...user };
}

function toManagedUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ManagedUser {
  return {
    ...toAuthUser(user),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthUser> {
  const normalizedUsername = username.trim().toLocaleLowerCase("en-US");
  const user = await db.user.findUnique({
    where: { username: normalizedUsername },
  });
  if (
    !user ||
    !user.isActive ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    throw new InvalidCredentialsError();
  }
  return toAuthUser(user);
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const users = await db.user.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return users.map(toManagedUser);
}

export async function createManagedUser(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<ManagedUser> {
  const username = normalizeUsername(input.username);
  const displayName = normalizeDisplayName(input.displayName);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          username,
          displayName,
          passwordHash,
          role: "USER",
          mustChangePassword: true,
          workspaces: {
            create: {
              name: DEFAULT_WORKSPACE_NAME,
              description: `${displayName} 的个人空间`,
            },
          },
        },
      });
      return created;
    });
    return toManagedUser(user);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new DuplicateUsernameError();
    }
    throw error;
  }
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new InvalidCredentialsError();
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    db.session.deleteMany({ where: { userId } }),
  ]);
}

export async function resetManagedUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  try {
    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true },
      }),
      db.session.deleteMany({ where: { userId } }),
    ]);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      throw new ManagedUserNotFoundError();
    }
    throw error;
  }
}

export async function setManagedUserActive(
  userId: string,
  isActive: boolean,
): Promise<ManagedUser> {
  try {
    const user = await db.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: { isActive },
      });
      if (!isActive) {
        await transaction.session.deleteMany({ where: { userId } });
      }
      return updated;
    });
    return toManagedUser(user);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      throw new ManagedUserNotFoundError();
    }
    throw error;
  }
}

export async function bootstrapAdministrator(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<AuthUser> {
  const existingAdmin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (existingAdmin) {
    await db.workspace.updateMany({
      where: { ownerId: null },
      data: { ownerId: existingAdmin.id },
    });
    return toAuthUser(existingAdmin);
  }

  const username = normalizeUsername(input.username);
  const displayName = normalizeDisplayName(input.displayName);
  const passwordHash = await hashPassword(input.password);
  const administrator = await db.$transaction(async (transaction) => {
    const created = await transaction.user.create({
      data: {
        username,
        displayName,
        passwordHash,
        role: "ADMIN",
        isActive: true,
        mustChangePassword: true,
      },
    });
    const assigned = await transaction.workspace.updateMany({
      where: { ownerId: null },
      data: { ownerId: created.id },
    });
    if (!assigned.count) {
      await transaction.workspace.create({
        data: { ownerId: created.id, name: DEFAULT_WORKSPACE_NAME },
      });
    }
    return created;
  });
  return toAuthUser(administrator);
}
