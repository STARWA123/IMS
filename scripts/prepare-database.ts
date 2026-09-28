import { closeSync, openSync } from "node:fs";
import {
  databaseFile,
  ensureDatabaseDirectory,
} from "../src/db/database-path";

ensureDatabaseDirectory();

// Prisma 7 migrate deploy expects the SQLite database file to exist.
// Opening in append mode creates it without truncating an existing database.
closeSync(openSync(databaseFile, "a"));

console.info(`Database file ready: ${databaseFile}`);
