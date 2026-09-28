import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// OfferTrack is started from its project root. Resolving from cwd keeps every
// runtime database path inside that project and is compatible with Next.js bundling.
export const databaseDirectory = resolve(process.cwd(), "data");
export const databaseFile = resolve(databaseDirectory, "offertrack.db");
export const databaseUrl = `file:${databaseFile.replaceAll("\\", "/")}`;

export function ensureDatabaseDirectory(): void {
  mkdirSync(databaseDirectory, { recursive: true });
}
