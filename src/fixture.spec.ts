import { describe, expect, it } from "vitest";
import { Fixture } from "./fixture";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

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

    it("should create nested directories automatically", async () => {
      await using fixture = await Fixture.create({
        "a/b/c/deep.txt": "deep",
      });

      expect(await fs.readFile(path.join(fixture.root, "a/b/c/deep.txt"), "utf-8")).toBe("deep");
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

    it("should support slash paths inside nested directories", async () => {
      await using fixture = await Fixture.create({
        src: {
          "a/b/deep.txt": "deep",
        },
      });

      expect(await fs.readFile(path.join(fixture.root, "src/a/b/deep.txt"), "utf-8")).toBe("deep");
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
});
