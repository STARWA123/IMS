import type { Workspace } from "../generated/prisma/client";
import { db } from "./client";

export const DEFAULT_WORKSPACE_NAME = "My Workspace";

/**
 * Ensures a newly created database always contains the product's default
 * workspace. Existing workspace data is never renamed or overwritten.
 * Migrations must be deployed before this function is called.
 */
export async function initializeDatabase(ownerId: string): Promise<Workspace> {
  return db.$transaction(async (transaction) => {
    const existingWorkspace = await transaction.workspace.findFirst({
      where: { ownerId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (existingWorkspace) {
      return existingWorkspace;
    }

    return transaction.workspace.create({
      data: {
        ownerId,
        name: DEFAULT_WORKSPACE_NAME,
      },
    });
  });
}
