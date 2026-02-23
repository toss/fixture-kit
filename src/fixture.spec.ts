import { describe, expect, it } from "vitest";
import { Fixture } from "./fixture";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

describe("Fixture", () => {
  describe("create", () => {
    it("should throw error if source is a file", async () => {
      await expect(Fixture.create({ source: testFixture("basic/package.json") })).rejects.toThrow(
        "source must be a directory",
      );
    });

    it("should throw error if source does not exist", async () => {
      await expect(Fixture.create({ source: testFixture("nonexistent") })).rejects.toThrow();
    });

    it("should create files from files option", async () => {
      await using fixture = await Fixture.create({
        files: {
          "hello.txt": "world",
          "package.json": '{"name":"test"}',
        },
      });

      expect(await fs.readFile(path.join(fixture.root, "hello.txt"), "utf-8")).toBe("world");
      expect(await fs.readFile(path.join(fixture.root, "package.json"), "utf-8")).toBe(
        '{"name":"test"}',
      );
    });

    it("should create nested directories automatically", async () => {
      await using fixture = await Fixture.create({
        files: { "a/b/c/deep.txt": "deep" },
      });

      expect(await fs.readFile(path.join(fixture.root, "a/b/c/deep.txt"), "utf-8")).toBe("deep");
    });

    it("should create files from empty string content", async () => {
      await using fixture = await Fixture.create({
        files: { "empty.txt": "" },
      });

      expect(await fs.readFile(path.join(fixture.root, "empty.txt"), "utf-8")).toBe("");
    });

    it("should copy source directory", async () => {
      await using fixture = await Fixture.create({
        source: testFixture("basic"),
      });

      expect(await fs.readFile(path.join(fixture.root, "package.json"), "utf-8")).toBe(
        await fs.readFile(path.join(testFixture("basic"), "package.json"), "utf-8"),
      );
    });

    it("should copy nested structure of source directory recursively", async () => {
      await using fixture = await Fixture.create({
        source: testFixture("basic"),
      });

      expect(await fs.readFile(path.join(fixture.root, "src/index.ts"), "utf-8")).toBe(
        await fs.readFile(path.join(testFixture("basic"), "src/index.ts"), "utf-8"),
      );
    });

    it("should add files after copying source directory", async () => {
      await using fixture = await Fixture.create({
        source: testFixture("basic"),
        files: { "extra.txt": "added" },
      });

      await expect(fs.access(path.join(fixture.root, "package.json"))).resolves.not.toThrow();
      expect(await fs.readFile(path.join(fixture.root, "extra.txt"), "utf-8")).toBe("added");
    });

    it("should overwrite existing files after copying source directory", async () => {
      await using fixture = await Fixture.create({
        source: testFixture("basic"),
        files: { "package.json": '{"name":"overridden"}' },
      });

      expect(await fs.readFile(path.join(fixture.root, "package.json"), "utf-8")).toBe(
        '{"name":"overridden"}',
      );
    });
  });

  describe("cleanup", () => {
    it("should delete root directory", async () => {
      const fixture = await Fixture.create({ files: { "a.txt": "a" } });
      await expect(fs.access(fixture.root)).resolves.not.toThrow();

      await fixture.cleanup();
      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should delete only once even if cleanup is called multiple times", async () => {
      const fixture = await Fixture.create({ files: { "a.txt": "a" } });

      await Promise.all([fixture.cleanup(), fixture.cleanup(), fixture.cleanup()]);

      await expect(fs.access(fixture.root)).rejects.toThrow();
    });

    it("should not throw error for already deleted directory", async () => {
      const fixture = await Fixture.create({ files: { "a.txt": "a" } });
      await fs.rm(fixture.root, { recursive: true, force: true });

      await expect(fixture.cleanup()).resolves.not.toThrow();
    });
  });

  describe("AsyncDisposable", () => {
    it("should be automatically cleaned up when scope ends using await using", async () => {
      let root: string;

      {
        await using fixture = await Fixture.create({ source: testFixture("basic") });
        root = fixture.root;
        await expect(fs.access(root)).resolves.not.toThrow();
      }

      await expect(fs.access(root)).rejects.toThrow();
    });
  });
});
