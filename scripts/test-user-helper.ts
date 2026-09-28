import { db } from "../src/db/client";

export async function createTestOwner(marker: string): Promise<{ id: string }> {
  return db.user.create({
    data: {
      username: `test-${marker}`.toLocaleLowerCase("en-US").replace(/[^a-z0-9._-]/g, "-").slice(0, 32),
      displayName: "Automated Test Owner",
      passwordHash: "test-only-not-a-real-password-hash",
      role: "USER",
      isActive: true,
      mustChangePassword: false,
    },
    select: { id: true },
  });
}
