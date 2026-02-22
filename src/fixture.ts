import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type CreateOptions =
  | {
      /** Directory to copy as base fixture */
      source?: string;
      /** Files to create or override */
      files: Record<string, string>;
    }
  | {
      /** Directory to copy as base fixture */
      source: string;
      /** Files to create or override */
      files?: Record<string, string>;
    };

export class Fixture implements AsyncDisposable {
  /**
   * @description The root directory of the fixture.
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

  static async create(options: CreateOptions): Promise<Fixture> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fixture-kit-"));
    const fixture = new Fixture(tmpDir);

    try {
      if (options.source != null) {
        const sourcePath = path.resolve(options.source);
        const stat = await fs.stat(sourcePath);
        if (!stat.isDirectory()) {
          throw new Error(`source must be a directory: ${sourcePath}`);
        }

        await fs.cp(sourcePath, fixture.root, { recursive: true });
      }

      if (options.files != null) {
        await Promise.all(
          Object.entries(options.files).map(async ([filepath, content]) => {
            const fullPath = path.join(fixture.root, filepath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content);
          })
        );
      }

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
