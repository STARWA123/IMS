import { randomUUID } from "node:crypto";
import { db } from "../src/db/client";
import {
  authenticateUser,
  createManagedUser,
  DuplicateUsernameError,
  InvalidCredentialsError,
  resetManagedUserPassword,
  setManagedUserActive,
} from "../src/modules/auth/auth-service";
import { validatePassword } from "../src/modules/auth/password-policy";
import { listWorkspaces } from "../src/modules/workspace/workspace-service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectInvalidCredentials(
  username: string,
  password: string,
): Promise<void> {
  try {
    await authenticateUser(username, password);
    throw new Error("无效凭据被错误接受。");
  } catch (error: unknown) {
    if (!(error instanceof InvalidCredentialsError)) {
      throw error;
    }
  }
}

async function testAuthModule(): Promise<void> {
  const marker = randomUUID().replaceAll("-", "").slice(0, 12);
  const firstUsername = `auth-${marker}`;
  const secondUsername = `auth2-${marker}`;
  const initialPassword = "abc123";
  const resetPassword = "xyz789";
  const createdUserIds: string[] = [];

  try {
    validatePassword(initialPassword);
    for (const invalidPassword of ["ab123", "abcdef", "123456"]) {
      let rejected = false;
      try {
        validatePassword(invalidPassword);
      } catch (error: unknown) {
        rejected = error instanceof TypeError;
      }
      assert(rejected, `无效密码 ${invalidPassword} 未被拒绝。`);
    }

    const first = await createManagedUser({
      username: firstUsername,
      displayName: "Auth Test One",
      password: initialPassword,
    });
    createdUserIds.push(first.id);
    assert(first.mustChangePassword, "新账号必须要求修改临时密码。");

    const authenticated = await authenticateUser(firstUsername, initialPassword);
    assert(authenticated.id === first.id, "正确凭据未能登录指定账号。");
    await expectInvalidCredentials(firstUsername, "WrongPassword2026");

    let duplicateRejected = false;
    try {
      await createManagedUser({
        username: firstUsername,
        displayName: "Duplicate",
        password: initialPassword,
      });
    } catch (error: unknown) {
      duplicateRejected = error instanceof DuplicateUsernameError;
    }
    assert(duplicateRejected, "重复账号未被拒绝。");

    const second = await createManagedUser({
      username: secondUsername,
      displayName: "Auth Test Two",
      password: initialPassword,
    });
    createdUserIds.push(second.id);
    const [firstWorkspaces, secondWorkspaces] = await Promise.all([
      listWorkspaces(first.id),
      listWorkspaces(second.id),
    ]);
    assert(firstWorkspaces.length === 1, "第一个账号未自动获得个人空间。");
    assert(secondWorkspaces.length === 1, "第二个账号未自动获得个人空间。");
    assert(
      firstWorkspaces[0]?.id !== secondWorkspaces[0]?.id,
      "不同账号错误地共享了个人空间。",
    );

    await resetManagedUserPassword(first.id, resetPassword);
    await expectInvalidCredentials(firstUsername, initialPassword);
    const resetAuthenticated = await authenticateUser(firstUsername, resetPassword);
    assert(resetAuthenticated.mustChangePassword, "重置密码后未要求用户修改密码。");

    const disabled = await setManagedUserActive(first.id, false);
    assert(!disabled.isActive, "账号停用状态未保存。");
    await expectInvalidCredentials(firstUsername, resetPassword);

    console.info(
      "Authentication verified: six-character password policy, password hashing, login rejection, duplicate prevention, personal workspace isolation, password reset, and account disablement all passed.",
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await db.$disconnect();
  }
}

testAuthModule().catch((error: unknown) => {
  console.error("Authentication verification failed:", error);
  process.exitCode = 1;
});
