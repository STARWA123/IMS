import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import {
  databaseUrl,
  ensureDatabaseDirectory,
} from "./database-path";

const globalForPrisma = globalThis as typeof globalThis & {
  offerTrackPrisma?: PrismaClient;
};

function createDatabaseClient(): PrismaClient {
  ensureDatabaseDirectory();
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.offerTrackPrisma ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.offerTrackPrisma = db;
}
