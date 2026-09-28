import fs from "node:fs/promises";
import path from "node:path";
import type { FixtureOptions, FixtureTree } from "./types.js";
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
  readonly #options: FixtureOptions;
  #cleanupPromise: Promise<void> | null = null;

  /**
   * @note Use `Fixture.create` to create a new fixture.
   * @internal
   */
  private constructor(root: string, options: FixtureOptions = {}) {
    this.root = root;
    this.#options = options;
  }

  static async fromDirectory(directory: string, options?: FixtureOptions): Promise<Fixture> {
    const fixture = new Fixture(await createTempDir(), options);

    try {
      const sourcePath = path.resolve(directory);
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        throw new Error(`source must be a directory: ${sourcePath}`);
      }

      await fs.cp(sourcePath, fixture.root, { recursive: true, verbatimSymlinks: true });
      await fixture.#options.setup?.(fixture);

      return fixture;
    } catch (error) {
      return fixture.#rejectAfterCleanup(error);
    }
  }

  static async create(inlineFixture: FixtureTree, options?: FixtureOptions): Promise<Fixture> {
    const fixture = new Fixture(await createTempDir(), options);

    try {
      await writeFixtureTree(fixture.root, inlineFixture);
      await fixture.#options.setup?.(fixture);

      return fixture;
    } catch (error) {
      return fixture.#rejectAfterCleanup(error);
    }
  }

  cleanup(): Promise<void> {
    this.#cleanupPromise ??= Promise.resolve().then(() => this.#cleanup());

    return this.#cleanupPromise;
  }

  async #cleanup(): Promise<void> {
    const errors: unknown[] = [];

    try {
      await this.#options.teardown?.(this);
    } catch (error) {
      errors.push(error);
    }

    try {
      await fs.rm(this.root, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }

    if (errors.length > 0) {
      throwCleanupError(errors);
    }
  }

  async #rejectAfterCleanup(error: unknown): Promise<never> {
    try {
      await this.cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Fixture setup failed and cleanup failed");
    }

    throw error;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return this.cleanup();
  }
}

function throwCleanupError(errors: unknown[]): never {
  if (errors.length === 1) {
    throw errors[0];
  }

  throw new AggregateError(errors, "Fixture cleanup failed");
}
