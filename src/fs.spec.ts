import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTempDir, writeFixtureTree } from "./fs.js";

describe("createTempDir", () => {
  const created: string[] = [];

  afterEach(async () => {
    await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("should create an existing directory under the OS temp dir", async () => {
    const dir = await createTempDir();
    created.push(dir);

    const stat = await fs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
    expect(dir.startsWith(await fs.realpath(os.tmpdir()))).toBe(true);
    expect(path.basename(dir).startsWith("fixture-kit-")).toBe(true);
  });

  it("should return a symlink-resolved canonical path", async () => {
    const dir = await createTempDir();
    created.push(dir);

    expect(dir).toBe(await fs.realpath(dir));
  });

  it("should return a unique directory per call", async () => {
    const [a, b] = await Promise.all([createTempDir(), createTempDir()]);
    created.push(a, b);

    expect(a).not.toBe(b);
  });
});

describe("writeFixtureTree", () => {
  let root: string;

  const setup = async () => {
    root = await createTempDir();
    return root;
  };

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("should write a flat file", async () => {
    await writeFixtureTree(await setup(), { "a.txt": "hello" });

    expect(await fs.readFile(path.join(root, "a.txt"), "utf-8")).toBe("hello");
  });

  it("should reject a slash-separated key", async () => {
    await expect(writeFixtureTree(await setup(), { "a/b/c.txt": "deep" })).rejects.toThrow(
      "invalid fixture path",
    );
  });

  it("should write a nested object as directories", async () => {
    await writeFixtureTree(await setup(), { src: { "index.ts": "export {}" } });

    expect(await fs.readFile(path.join(root, "src/index.ts"), "utf-8")).toBe("export {}");
  });

  it("should treat a null-prototype object as a nested directory", async () => {
    const subtree: Record<string, string> = Object.create(null);
    subtree["nested.txt"] = "value";

    await writeFixtureTree(await setup(), { dir: subtree });

    expect(await fs.readFile(path.join(root, "dir/nested.txt"), "utf-8")).toBe("value");
  });

  it("should do nothing for an empty tree", async () => {
    await writeFixtureTree(await setup(), {});

    expect(await fs.readdir(root)).toEqual([]);
  });

  it("should reject a path that escapes the root with ..", async () => {
    await expect(writeFixtureTree(await setup(), { "../escape.txt": "x" })).rejects.toThrow(
      "invalid fixture path",
    );
  });

  it("should reject an absolute path that escapes the root", async () => {
    await expect(writeFixtureTree(await setup(), { "/etc/passwd": "x" })).rejects.toThrow(
      "invalid fixture path",
    );
  });

  it.each([
    ["an array", ["x"]],
    ["null", null],
    ["a Date", new Date()],
  ])("should reject %s as content", async (_label, value) => {
    await expect(writeFixtureTree(await setup(), { dir: value } as never)).rejects.toThrow(
      TypeError,
    );
  });
});
