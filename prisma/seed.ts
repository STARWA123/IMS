import { db } from "../src/db/client";
import { bootstrapAdministrator } from "../src/modules/auth/auth-service";

async function seed(): Promise<void> {
  const existingAdmin = await db.user.findFirst({ where: { role: "ADMIN" } });
  const username = process.env.OFFERTRACK_ADMIN_USERNAME;
  const displayName = process.env.OFFERTRACK_ADMIN_DISPLAY_NAME;
  const password = process.env.OFFERTRACK_ADMIN_PASSWORD;

  if (!existingAdmin && (!username || !displayName || !password)) {
    throw new Error(
      "首次初始化需要设置 OFFERTRACK_ADMIN_USERNAME、OFFERTRACK_ADMIN_DISPLAY_NAME 和 OFFERTRACK_ADMIN_PASSWORD。",
    );
  }

  if (existingAdmin) {
    await db.workspace.updateMany({
      where: { ownerId: null },
      data: { ownerId: existingAdmin.id },
    });
    console.info(`Administrator ready: ${existingAdmin.username}`);
    return;
  }

  const administrator = await bootstrapAdministrator({
    username: username!,
    displayName: displayName!,
    password: password!,
  });
  console.info(`Administrator ready: ${administrator.username}`);
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
