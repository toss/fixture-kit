import { describe, expect, it, vi } from "vitest";
import { Fixture } from "./fixture.js";
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
  });

  describe("cleanup on error", () => {
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
