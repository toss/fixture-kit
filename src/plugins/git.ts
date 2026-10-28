import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { FixturePlugin } from "../types.js";

const execFileAsync = promisify(execFile);
const repositoryEnvironment = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
]);

/** Initialize a Git repository in the fixture root. */
export function gitPlugin(): FixturePlugin {
  return {
    async setup({ root }) {
      const existing = await fs
        .lstat(path.join(root, ".git"))
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") {
            return undefined;
          }
          throw error;
        });
      if (existing) {
        throw new Error("gitPlugin requires a fixture without an existing .git entry");
      }

      const env = { ...process.env };
      // Inherited repository paths must not redirect init outside the fixture.
      for (const name of Object.keys(env)) {
        if (repositoryEnvironment.has(name.toUpperCase())) {
          delete env[name];
        }
      }

      await execFileAsync("git", ["init"], { cwd: root, env });
    },
  };
}
