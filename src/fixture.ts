import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * @description A file tree where string values are file contents and
 * object values are nested directories.
 */
export interface FixtureTree {
  [name: string]: string | FixtureTree;
}

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

  static async create(inlineFixture: FixtureTree): Promise<Fixture> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fixture-kit-"));
    const fixture = new Fixture(tmpDir);

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

async function writeFixtureTree(directory: string, tree: FixtureTree): Promise<void> {
  await Promise.all(
    Object.entries(tree).map(async ([filepath, content]) => {
      const fullPath = path.join(directory, filepath);

      if (typeof content === "string") {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      } else {
        await fs.mkdir(fullPath, { recursive: true });
        await writeFixtureTree(fullPath, content);
      }
    }),
  );
}
