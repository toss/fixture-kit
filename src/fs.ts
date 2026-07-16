import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import type { FixtureTree } from "./types.js";
import { isPlainObject } from "./utils.js";

const DEFAULT_TEMP_DIR_PREFIX = "fixture-kit-";

export async function createTempDir(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), DEFAULT_TEMP_DIR_PREFIX));

  try {
    // Resolve symlinks (e.g. macOS `/var` → `/private/var`) so `root` is canonical.
    return await fs.realpath(tmpDir);
  } catch (error) {
    // Clean up the temp dir if we fail to resolve it.
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

export async function writeFixtureTree(directory: string, tree: FixtureTree): Promise<void> {
  await Promise.all(
    Object.entries(tree).map(async ([name, content]) => {
      const validName = parseValidName(name);
      const fullPath = path.join(directory, validName);

      if (typeof content === "string") {
        await fs.writeFile(fullPath, content);
      } else if (isPlainObject(content)) {
        await fs.mkdir(fullPath, { recursive: true });
        await writeFixtureTree(fullPath, content);
      } else {
        throw new TypeError(`invalid fixture content for ${name}: expected string or object`);
      }
    }),
  );
}

// A key names a single entry, not a path: no separators, no traversal.
// Directories are expressed with nested objects, never slash-separated
// keys. A lone segment that isn't `.`/`..` can't climb out of `directory`.
function parseValidName(name: string): string {
  if (name === "") {
    throw new Error(`invalid fixture path "${name}": keys must not be empty`);
  }

  if (name === "." || name === "..") {
    throw new Error(`invalid fixture path "${name}": keys must not be "." or ".."`);
  }

  if (name.includes("/") || name.includes("\\")) {
    throw new Error(
      `invalid fixture path "${name}": keys must name a single entry; use nested objects for directories`,
    );
  }

  return name;
}
