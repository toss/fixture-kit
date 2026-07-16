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
    return fs.realpath(tmpDir);
  } catch (error) {
    // Clean up the temp dir if we fail to resolve it.
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

export async function writeFixtureTree(
  directory: string,
  tree: FixtureTree,
  rootDir: string = directory,
): Promise<void> {
  await Promise.all(
    Object.entries(tree).map(async ([filepath, content]) => {
      const fullPath = path.resolve(directory, filepath);
      const relative = path.relative(rootDir, fullPath);
      // Reject paths that don't resolve to a proper descendant of the root.
      // - `""`: the key resolves to the root itself (e.g. `.`, `foo/..`, or a
      //   nested `..` that climbs back to root). There's no file to write there.
      // - `..` traversal within the same root. Match on the segment boundary
      //   (`..` or `../`), not a bare prefix, so a legit file like `..config`
      //   isn't flagged.
      // - a different root entirely. On Windows, `path.relative` between paths
      //   on different drives/UNC shares (e.g. `C:\` vs `D:\`) cannot produce a
      //   relative path, so it returns an absolute one that has no `..` prefix.
      const isOutsideRoot =
        relative === "" ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative);

      if (isOutsideRoot) {
        throw new Error(`invalid fixture path: ${filepath}`);
      }

      if (typeof content === "string") {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      } else if (isPlainObject(content)) {
        await fs.mkdir(fullPath, { recursive: true });
        await writeFixtureTree(fullPath, content, rootDir);
      } else {
        throw new TypeError(`invalid fixture content for ${filepath}: expected string or object`);
      }
    }),
  );
}
