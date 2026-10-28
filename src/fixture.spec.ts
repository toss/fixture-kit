import { describe, expect, it, vi } from "vitest";
import { Fixture } from "./fixture.js";
import type { FixtureContext, FixtureOptions } from "./index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

describe("Fixture", () => {
  describe("fromDirectory", () => {
    it("should throw error if source is a file", async () => {
      await expect(Fixture.fromDirectory(testFixture("basic/package.json"))).rejects.toThrow(
        "source must be a directory",
      );
    });

    it("should throw error if source does not exist", async () => {
      await expect(Fixture.fromDirectory(testFixture("nonexistent"))).rejects.toThrow();
    });

    it("should copy source directory", async () => {
      await using fixture = await Fixture.fromDirectory(testFixture("basic"));

      expect(await fs.readFile(path.join(fixture.root, "package.json"), "utf-8")).toBe(
        await fs.readFile(path.join(testFixture("basic"), "package.json"), "utf-8"),
      );
    });

    it("should copy nested structure of source directory recursively", async () => {
      await using fixture = await Fixture.fromDirectory(testFixture("basic"));

      expect(await fs.readFile(path.join(fixture.root, "src/index.ts"), "utf-8")).toBe(
        await fs.readFile(path.join(testFixture("basic"), "src/index.ts"), "utf-8"),
      );
    });

    // Windows needs an elevated process to create symlinks, so this runs on POSIX only.
    it.skipIf(process.platform === "win32")(
      "should keep a relative symlink pointing inside the copy",
      async () => {
        const source = await fs.mkdtemp(path.join(os.tmpdir(), "fixture-kit-source-"));

        try {
          await fs.writeFile(path.join(source, "target.txt"), "original");
          await fs.symlink("target.txt", path.join(source, "link.txt"));

          await using fixture = await Fixture.fromDirectory(source);
          await fs.writeFile(path.join(fixture.root, "link.txt"), "written through the link");

          expect(await fs.readFile(path.join(fixture.root, "target.txt"), "utf-8")).toBe(
            "written through the link",
          );
          expect(await fs.readFile(path.join(source, "target.txt"), "utf-8")).toBe("original");
        } finally {
          await fs.rm(source, { recursive: true, force: true });
        }
      },
    );
  });

  describe("create", () => {
    it("should create files from inline fixture", async () => {
      await using fixture = await Fixture.create({
        "hello.txt": "world",
        "package.json": '{"name":"test"}',
      });

      expect(await fs.readFile(path.join(fixture.root, "hello.txt"), "utf-8")).toBe("world");
      expect(await fs.readFile(path.join(fixture.root, "package.json"), "utf-8")).toBe(
        '{"name":"test"}',
      );
    });

    it("should reject a slash-separated key", async () => {
      await expect(Fixture.create({ "a/b/c/deep.txt": "deep" })).rejects.toThrow(
        "invalid fixture path",
      );
    });

    it("should create files from empty string content", async () => {
      await using fixture = await Fixture.create({
        "empty.txt": "",
      });

      expect(await fs.readFile(path.join(fixture.root, "empty.txt"), "utf-8")).toBe("");
    });

    it("should interpret object values as nested directories", async () => {
      await using fixture = await Fixture.create({
        "package.json": '{"name":"test"}',
        src: {
          "index.ts": "export {}",
          utils: {
            "helper.ts": "export const helper = 1;",
          },
        },
      });

      expect(await fs.readFile(path.join(fixture.root, "package.json"), "utf-8")).toBe(
        '{"name":"test"}',
      );
      expect(await fs.readFile(path.join(fixture.root, "src/index.ts"), "utf-8")).toBe("export {}");
      expect(await fs.readFile(path.join(fixture.root, "src/utils/helper.ts"), "utf-8")).toBe(
        "export const helper = 1;",
      );
    });

    it("should create an empty directory from an empty object", async () => {
      await using fixture = await Fixture.create({
        empty: {},
      });

      const stat = await fs.stat(path.join(fixture.root, "empty"));
      expect(stat.isDirectory()).toBe(true);
      expect(await fs.readdir(path.join(fixture.root, "empty"))).toEqual([]);
    });

    it("should reject a slash-separated key inside a nested object", async () => {
      await expect(Fixture.create({ src: { "a/b/deep.txt": "deep" } })).rejects.toThrow(
        "invalid fixture path",
      );
    });

    it("should reject paths that escape the fixture root with ..", async () => {
      await expect(Fixture.create({ "../escape.txt": "x" })).rejects.toThrow(
        "invalid fixture path",
      );
    });

    it("should reject .. traversal nested inside a directory", async () => {
      await expect(Fixture.create({ src: { "../../escape.txt": "x" } })).rejects.toThrow(
        "invalid fixture path",
      );
    });

    it("should reject absolute paths that escape the fixture root", async () => {
      await expect(Fixture.create({ "/etc/passwd": "x" })).rejects.toThrow("invalid fixture path");
    });

    it("should allow a file whose name merely starts with ..", async () => {
      await using fixture = await Fixture.create({ "..config": "value" });

      expect(await fs.readFile(path.join(fixture.root, "..config"), "utf-8")).toBe("value");
    });

    it("should reject paths that escape the fixture root", async () => {
      await expect(Fixture.create({ "../escape.txt": "nope" } as any)).rejects.toThrow(
        "invalid fixture path",
      );
    });

    it("should reject non-string, non-plain-object values", async () => {
      await expect(Fixture.create({ dir: new Date() } as any)).rejects.toThrow(TypeError);
    });

    it("should allow filenames that start with '..' but do not escape the fixture root", async () => {
      await using fixture = await Fixture.create({ "..ok.txt": "ok" });
      expect(await fs.readFile(path.join(fixture.root, "..ok.txt"), "utf-8")).toBe("ok");
    });

    it("should reject a key that resolves to the root itself", async () => {
      await expect(Fixture.create({ ".": "x" })).rejects.toThrow("invalid fixture path");
    });

    it("should reject a nested .. that climbs back to the root", async () => {
      await expect(Fixture.create({ src: { "..": "x" } })).rejects.toThrow("invalid fixture path");
    });

    it("should create an empty fixture from an empty tree", async () => {
      await using fixture = await Fixture.create({});

      const stat = await fs.stat(fixture.root);
      expect(stat.isDirectory()).toBe(true);
      expect(await fs.readdir(fixture.root)).toEqual([]);
    });

    it("should reject a slash-separated key with a nested object value", async () => {
      await expect(Fixture.create({ "a/b": { "c.txt": "deep" } })).rejects.toThrow(
        "invalid fixture path",
      );
    });

    it("should run setup after writing the fixture", async () => {
      let setupRoot: string | undefined;

      const fixture = await Fixture.create(
        { "config.json": "{}" },
        {
          plugins: [
            {
              setup: async (createdFixture) => {
                setupRoot = createdFixture.root;
                expect(
                  await fs.readFile(path.join(createdFixture.root, "config.json"), "utf-8"),
                ).toBe("{}");
                await fs.writeFile(path.join(createdFixture.root, "ready"), "yes");
              },
            },
          ],
        },
      );

      expect(setupRoot).toBe(fixture.root);
      expect(await fs.readFile(path.join(fixture.root, "ready"), "utf-8")).toBe("yes");
      await fixture.cleanup();
    });

    it("should run setup after copying a directory", async () => {
      let setupRoot: string | undefined;

      const fixture = await Fixture.fromDirectory(testFixture("basic"), {
        plugins: [
          {
            setup: async (createdFixture) => {
              setupRoot = createdFixture.root;
              expect(
                await fs.readFile(path.join(createdFixture.root, "package.json"), "utf-8"),
              ).toBe(await fs.readFile(path.join(testFixture("basic"), "package.json"), "utf-8"));
            },
          },
        ],
      });

      expect(setupRoot).toBe(fixture.root);
      await fixture.cleanup();
    });
  });

  describe("lifecycle hooks", () => {
    it("should run teardown before removing the root", async () => {
      let teardownRoot: string | undefined;
      let rootExistsDuringTeardown = false;

      const fixture = await Fixture.create(
        {},
        {
          plugins: [
            {
              teardown: async (createdFixture) => {
                teardownRoot = createdFixture.root;
                rootExistsDuringTeardown = await fs
                  .access(createdFixture.root)
                  .then(() => true)
                  .catch(() => false);
              },
            },
          ],
        },
      );

      await fixture.cleanup();

      expect(teardownRoot).toBe(fixture.root);
      expect(rootExistsDuringTeardown).toBe(true);
      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should run teardown once for concurrent cleanup calls", async () => {
      const teardown = vi.fn();
      const fixture = await Fixture.create({}, { plugins: [{ teardown }] });

      const cleanup = fixture.cleanup();
      expect(fixture.cleanup()).toBe(cleanup);
      await Promise.all([cleanup, fixture.cleanup(), fixture.cleanup()]);
      await fixture.cleanup();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it("should not repeat failed cleanup for concurrent or later calls", async () => {
      const teardownError = new Error("teardown failed");
      const teardown = vi.fn().mockRejectedValue(teardownError);
      const fixture = await Fixture.create({}, { plugins: [{ teardown }] });
      const remove = vi.spyOn(fs, "rm");

      try {
        const cleanups = [fixture.cleanup(), fixture.cleanup(), fixture.cleanup()];
        await Promise.all(cleanups.map((cleanup) => expect(cleanup).rejects.toBe(teardownError)));
        await expect(fixture.cleanup()).rejects.toBe(teardownError);

        expect(teardown).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith(fixture.root, { recursive: true, force: true });
        await expect(fs.access(fixture.root)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        remove.mockRestore();
        await fs.rm(fixture.root, { recursive: true, force: true });
      }
    });

    it("should run setup in order and teardown in reverse order", async () => {
      const events: string[] = [];
      const fixture = await Fixture.create(
        {},
        {
          plugins: [
            {
              setup: async ({ root }) => {
                await fs.writeFile(path.join(root, "ready"), "first");
                events.push("first setup");
              },
              teardown: async ({ root }) => {
                expect(await fs.readFile(path.join(root, "ready"), "utf-8")).toBe(
                  "second teardown",
                );
                events.push("first teardown");
              },
            },
            {
              setup: async ({ root }) => {
                expect(await fs.readFile(path.join(root, "ready"), "utf-8")).toBe("first");
                events.push("second setup");
              },
              teardown: async ({ root }) => {
                await fs.writeFile(path.join(root, "ready"), "second teardown");
                events.push("second teardown");
              },
            },
          ],
        },
      );

      expect(events).toEqual(["first setup", "second setup"]);
      await fixture.cleanup();

      expect(events).toEqual(["first setup", "second setup", "second teardown", "first teardown"]);
      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it.each(["create", "fromDirectory"] as const)(
      "should clean up entered plugins when setup fails in %s",
      async (method) => {
        const events: string[] = [];
        const setupError = new Error("second setup failed");
        const skippedSetup = vi.fn();
        const skippedTeardown = vi.fn();
        let root: string | undefined;
        const options = {
          plugins: [
            {
              setup: () => {
                events.push("first setup");
              },
              teardown: () => {
                events.push("first teardown");
              },
            },
            {
              setup: (fixture: FixtureContext) => {
                root = fixture.root;
                events.push("second setup");
                throw setupError;
              },
              teardown: () => {
                events.push("second teardown");
              },
            },
            { setup: skippedSetup, teardown: skippedTeardown },
          ],
        };

        const result =
          method === "create"
            ? Fixture.create({}, options)
            : Fixture.fromDirectory(testFixture("basic"), options);
        await expect(result).rejects.toBe(setupError);

        expect(events).toEqual([
          "first setup",
          "second setup",
          "second teardown",
          "first teardown",
        ]);
        expect(skippedSetup).not.toHaveBeenCalled();
        expect(skippedTeardown).not.toHaveBeenCalled();
        await expect(fs.access(root!)).rejects.toThrow();
      },
    );

    it.each(["create", "fromDirectory"] as const)(
      "should clean up a partial resource when async setup fails in %s",
      async (method) => {
        const setupError = new Error("async setup failed");
        const skippedSetup = vi.fn();
        const skippedTeardown = vi.fn();
        let root: string | undefined;
        const teardown = vi.fn(async (context: FixtureContext) => {
          const resource = path.join(context.root, "partial.txt");
          expect(await fs.readFile(resource, "utf-8")).toBe("ready");
          await fs.rm(resource);
        });
        const options: FixtureOptions = {
          plugins: [
            {
              setup: async (context) => {
                root = context.root;
                await fs.writeFile(path.join(root, "partial.txt"), "ready");
                throw setupError;
              },
              teardown,
            },
            { setup: skippedSetup, teardown: skippedTeardown },
          ],
        };

        try {
          const result =
            method === "create"
              ? Fixture.create({}, options)
              : Fixture.fromDirectory(testFixture("basic"), options);
          await expect(result).rejects.toBe(setupError);

          expect(teardown).toHaveBeenCalledTimes(1);
          expect(skippedSetup).not.toHaveBeenCalled();
          expect(skippedTeardown).not.toHaveBeenCalled();
          await expect(fs.access(root!)).rejects.toMatchObject({ code: "ENOENT" });
        } finally {
          if (root !== undefined) {
            await fs.rm(root, { recursive: true, force: true });
          }
        }
      },
    );

    it.each(["create", "fromDirectory"] as const)(
      "should not enter plugins when preparing files fails in %s",
      async (method) => {
        const setup = vi.fn();
        const teardown = vi.fn();
        const options = { plugins: [{ setup, teardown }] };
        const result =
          method === "create"
            ? Fixture.create({ "../escape.txt": "x" }, options)
            : Fixture.fromDirectory(testFixture("nonexistent"), options);

        await expect(result).rejects.toThrow();

        expect(setup).not.toHaveBeenCalled();
        expect(teardown).not.toHaveBeenCalled();
      },
    );

    it.each(["create", "fromDirectory"] as const)(
      "should remove the root when reading plugins fails in %s",
      async (method) => {
        const optionsError = new Error("plugins unavailable");
        const options: FixtureOptions = {
          get plugins(): FixtureOptions["plugins"] {
            throw optionsError;
          },
        };
        const createDirectory = vi.spyOn(fs, "mkdtemp");
        let created: string | undefined;

        try {
          const result =
            method === "create"
              ? Fixture.create({}, options)
              : Fixture.fromDirectory(testFixture("basic"), options);
          await expect(result).rejects.toBe(optionsError);

          created = await createDirectory.mock.results[0]?.value;
          expect(created).toBeTypeOf("string");
          await expect(fs.access(created!)).rejects.toThrow();
        } finally {
          createDirectory.mockRestore();
          if (created !== undefined) {
            await fs.rm(created, { recursive: true, force: true });
          }
        }
      },
    );

    it.each(["create", "fromDirectory"] as const)(
      "should accept an empty plugins array in %s",
      async (method) => {
        const options = { plugins: [] };
        await using fixture =
          method === "create"
            ? await Fixture.create({ "hello.txt": "world" }, options)
            : await Fixture.fromDirectory(testFixture("basic"), options);

        expect((await fs.stat(fixture.root)).isDirectory()).toBe(true);
        const filename = method === "create" ? "hello.txt" : "package.json";
        await expect(fs.readFile(path.join(fixture.root, filename), "utf-8")).resolves.toBeTruthy();
      },
    );

    it("should finish every teardown and remove the root when multiple teardowns fail", async () => {
      const firstError = new Error("first teardown failed");
      const secondError = new Error("second teardown failed");
      const events: string[] = [];
      const fixture = await Fixture.create(
        {},
        {
          plugins: [
            {
              teardown: () => {
                events.push("first teardown");
              },
            },
            {
              teardown: () => {
                events.push("second teardown");
                throw firstError;
              },
            },
            {
              teardown: async () => {
                events.push("third teardown");
                throw secondError;
              },
            },
          ],
        },
      );

      const error = await fixture.cleanup().catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toContain(firstError);
      expect((error as AggregateError).errors).toContain(secondError);
      expect(events).toEqual(["third teardown", "second teardown", "first teardown"]);
      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should expose only the root directory to plugin hooks", async () => {
      const contexts: FixtureContext[] = [];
      const fixture = await Fixture.create(
        {},
        {
          plugins: [
            {
              setup: (context) => {
                contexts.push(context);
              },
              teardown: (context) => {
                contexts.push(context);
              },
            },
          ],
        },
      );

      await fixture.cleanup();

      expect(contexts).toStrictEqual([{ root: fixture.root }, { root: fixture.root }]);
      for (const context of contexts) {
        expect(context).not.toHaveProperty("cleanup");
        expect(Symbol.asyncDispose in context).toBe(false);
      }
    });

    it("should remove the root when teardown fails", async () => {
      const teardownError = new Error("teardown failed");
      const fixture = await Fixture.create(
        {},
        {
          plugins: [{ teardown: () => Promise.reject(teardownError) }],
        },
      );

      await expect(fixture.cleanup()).rejects.toBe(teardownError);
      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should report teardown and removal errors together", async () => {
      const teardownError = new Error("teardown failed");
      const removalError = new Error("removal failed");
      const remove = vi.spyOn(fs, "rm").mockRejectedValueOnce(removalError);
      const fixture = await Fixture.create(
        {},
        {
          plugins: [{ teardown: () => Promise.reject(teardownError) }],
        },
      );

      try {
        const error = await fixture.cleanup().catch((caughtError: unknown) => caughtError);
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toContain(teardownError);
        expect((error as AggregateError).errors).toContain(removalError);
      } finally {
        remove.mockRestore();
        await fs.rm(fixture.root, { recursive: true, force: true });
      }
    });

    it("should preserve setup and teardown errors when setup fails", async () => {
      const setupError = new Error("setup failed");
      const teardownError = new Error("teardown failed");
      let root: string | undefined;

      const result = Fixture.create(
        {},
        {
          plugins: [
            {
              setup: (fixture) => {
                root = fixture.root;
                throw setupError;
              },
              teardown: () => {
                throw teardownError;
              },
            },
          ],
        },
      );

      const error = await result.catch((caughtError: unknown) => caughtError);
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toContain(setupError);
      expect((error as AggregateError).errors).toContain(teardownError);

      await expect(fs.access(root!)).rejects.toThrow();
    });
  });

  describe("root", () => {
    it("should be a symlink-resolved canonical path", async () => {
      await using fixture = await Fixture.create({ "a.txt": "a" });

      expect(fixture.root).toBe(await fs.realpath(fixture.root));
    });

    it("should match process.cwd() after chdir", async () => {
      await using fixture = await Fixture.create({ "a.txt": "a" });
      const original = process.cwd();

      try {
        process.chdir(fixture.root);
        expect(process.cwd()).toBe(fixture.root);
      } finally {
        process.chdir(original);
      }
    });
  });

  describe("cleanup", () => {
    it("should delete root directory", async () => {
      const fixture = await Fixture.create({ "a.txt": "a" });
      await expect(fs.access(fixture.root)).resolves.not.toThrow();

      await fixture.cleanup();
      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should delete only once even if cleanup is called multiple times", async () => {
      const fixture = await Fixture.create({ "a.txt": "a" });

      await Promise.all([fixture.cleanup(), fixture.cleanup(), fixture.cleanup()]);

      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should not throw error for already deleted directory", async () => {
      const fixture = await Fixture.create({ "a.txt": "a" });
      await fs.rm(fixture.root, { recursive: true, force: true });

      await expect(fixture.cleanup()).resolves.not.toThrow();
    });
  });

  describe("AsyncDisposable", () => {
    it("should be automatically cleaned up when scope ends using await using", async () => {
      let root: string;

      {
        await using fixture = await Fixture.fromDirectory(testFixture("basic"));
        root = fixture.root;
        await expect(fs.access(root)).resolves.not.toThrow();
      }

      await expect(fs.access(root)).rejects.toThrow();
    });

    it("should run teardown when the fixture is disposed", async () => {
      const teardown = vi.fn();

      {
        await using _fixture = await Fixture.create({}, { plugins: [{ teardown }] });
      }

      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanup on error", () => {
    it.each(["root", "nested"] as const)(
      "should wait for pending directory writes at the %s before cleanup",
      async (level) => {
        let releaseWrite!: () => void;
        const writeGate = new Promise<void>((resolve) => {
          releaseWrite = resolve;
        });
        let notifyWriteStarted!: () => void;
        const writeStarted = new Promise<void>((resolve) => {
          notifyWriteStarted = resolve;
        });
        const mkdir = fs.mkdir;
        const writeError = new Error("directory write failed");
        let pendingWrite: Promise<unknown> | undefined;
        const directoryWrite = vi.spyOn(fs, "mkdir").mockImplementation((directory, options) => {
          const name = path.basename(String(directory));
          if (name === "failing") {
            return Promise.reject(writeError);
          }
          if (name !== "pending") {
            return mkdir(directory, options);
          }

          notifyWriteStarted();
          const operation = writeGate.then(() => mkdir(directory, options));
          pendingWrite = operation;
          return operation;
        });
        const createDirectory = vi.spyOn(fs, "mkdtemp");
        const remove = vi.spyOn(fs, "rm");
        const tree = { pending: {}, failing: {} };
        const result = Fixture.create(level === "root" ? tree : { nested: tree }).catch(
          (error: unknown) => error,
        );
        let created: string | undefined;

        try {
          await writeStarted;
          created = await createDirectory.mock.results[0]?.value;
          // Let the rejected sibling reach cleanup if create returns too early.
          await new Promise<void>((resolve) => setImmediate(resolve));
          expect(remove).not.toHaveBeenCalled();

          releaseWrite();
          await expect(result).resolves.toBe(writeError);
          expect(remove).toHaveBeenCalledTimes(1);
          await expect(fs.access(created!)).rejects.toThrow();
        } finally {
          releaseWrite();
          await pendingWrite?.catch(() => {});
          await result;
          directoryWrite.mockRestore();
          createDirectory.mockRestore();
          remove.mockRestore();
          if (created !== undefined) {
            await fs.rm(created, { recursive: true, force: true });
          }
        }
      },
    );

    // The factories create a temp directory before doing any work; on failure
    // they must remove it so a rejected call leaves nothing behind. We spy on
    // mkdtemp to learn which directory was created, since the failing call
    // never returns a Fixture to read `root` from.
    it("should remove the temp directory when create fails", async () => {
      const spy = vi.spyOn(fs, "mkdtemp");

      try {
        await expect(Fixture.create({ "../escape.txt": "x" })).rejects.toThrow();

        const created = (await spy.mock.results[0]?.value) as string;
        await expect(fs.access(created)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
    });

    it("should remove the temp directory when fromDirectory fails", async () => {
      const spy = vi.spyOn(fs, "mkdtemp");

      try {
        await expect(Fixture.fromDirectory(testFixture("nonexistent"))).rejects.toThrow();

        const created = (await spy.mock.results[0]?.value) as string;
        await expect(fs.access(created)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
