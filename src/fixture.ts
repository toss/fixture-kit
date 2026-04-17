import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

  static async fromDirectory(directory: string): Promise<Fixture> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fixture-kit-"));
    const fixture = new Fixture(tmpDir);

    try {
      const sourcePath = path.resolve(directory);
      const stat = await fs.stat(sourcePath);
      if (!stat.isDirectory()) {
        throw new Error(`source must be a directory: ${sourcePath}`);
      }

      await fs.cp(sourcePath, fixture.root, { recursive: true });

      return fixture;
    } catch (error) {
      await fixture.cleanup();
      throw error;
    }
  }

  static async create(inlineFixture: Record<string, string>): Promise<Fixture> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fixture-kit-"));
    const fixture = new Fixture(tmpDir);

    try {
      await Promise.all(
        Object.entries(inlineFixture).map(async ([filepath, content]) => {
          const fullPath = path.join(fixture.root, filepath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }),
      );

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
