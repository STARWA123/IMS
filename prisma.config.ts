import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(projectRoot, "data", "offertrack.db").replaceAll(
  "\\",
  "/",
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // An absolute path derived from this repository prevents accidental writes
    // to AppData, the user profile, or another drive.
    url: `file:${databasePath}`,
  },
});
