import type { UserRole } from "../../generated/prisma/client";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};
export type ManagedUser = AuthUser & {
  createdAt: string;
  updatedAt: string;
};
