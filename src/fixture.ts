import fs from "node:fs/promises";
import path from "node:path";
import type { FixtureTree } from "./types.js";
import { createTempDir, writeFixtureTree } from "./fs.js";

export class Fixture implements AsyncDisposable {
  /**
   * @description The root directory of the fixture.
   *
   * This is a canonical, symlink-resolved absolute path, so it matches
   * `process.cwd()` after `process.chdir(fixture.root)` (relevant on macOS,
   * where the temp directory lives under a symlinked `/var` → `/private/var`).
   */
  readonly root: string;
  #cleanupPromise: Promise<void> | null = null;

  /**
   * @note Use `Fixture.create` to create a new fixture.
   * @internal
   */
  private constructor(root: string) {
    this.root = root;
  }

  static async fromDirectory(directory: string): Promise<Fixture> {
    const fixture = new Fixture(await createTempDir());

    try {
      const sourcePath = path.resolve(directory);
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        throw new Error(`source must be a directory: ${sourcePath}`);
      }

      await fs.cp(sourcePath, fixture.root, { recursive: true, verbatimSymlinks: true });

      return fixture;
    } catch (error) {
      await fixture.cleanup();
      throw error;
    }
  }

  static async create(inlineFixture: FixtureTree): Promise<Fixture> {
    const fixture = new Fixture(await createTempDir());

    try {
      await writeFixtureTree(fixture.root, inlineFixture);

      return fixture;
    } catch (error) {
      await fixture.cleanup();
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    this.#cleanupPromise ??= fs.rm(this.root, { recursive: true, force: true });

    return this.#cleanupPromise;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return this.cleanup();
  }
}
