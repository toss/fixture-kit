import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Fixture, gitPlugin } from "../index.js";

const git = promisify(execFile);

async function expectExistingRepositoryRejected(
  createFixture: () => Promise<Fixture>,
): Promise<void> {
  const createDirectory = vi.spyOn(fs, "mkdtemp");
  let root: string | undefined;

  try {
    await expect(createFixture()).rejects.toThrow(".git");
    root = await createDirectory.mock.results[0]?.value;
    expect(root).toBeTypeOf("string");
    await expect(fs.access(root!)).rejects.toThrow();
  } finally {
    root ??= await createDirectory.mock.results[0]?.value;
    createDirectory.mockRestore();
    if (root !== undefined) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
}

describe("gitPlugin", () => {
  let configFixture: Fixture;

  beforeAll(async () => {
    configFixture = await Fixture.create({ gitconfig: "" });
  });

  afterAll(async () => {
    await configFixture?.cleanup();
  });

  beforeEach(() => {
    vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(configFixture.root, "gitconfig"));
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("GIT_CONFIG_COUNT", "0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should initialize a repository without staging or committing fixture files", async () => {
    let root: string;

    {
      await using fixture = await Fixture.create(
        { "hello.txt": "hello" },
        { plugins: [gitPlugin()] },
      );
      root = fixture.root;

      const repository = await git("git", ["rev-parse", "--show-toplevel"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(await fs.realpath(repository.stdout.trim())).toBe(root);
      expect(await fs.readFile(path.join(root, "hello.txt"), "utf8")).toBe("hello");

      const index = await git("git", ["ls-files", "--stage"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(index.stdout).toBe("");
      await expect(
        git("git", ["rev-parse", "--verify", "HEAD"], { cwd: root }),
      ).rejects.toMatchObject({
        code: 128,
      });
    }

    await expect(fs.access(root)).rejects.toThrow();
  });

  it("should initialize copied fixtures without changing their source", async () => {
    await using source = await Fixture.create({ "source.txt": "original" });
    await using fixture = await Fixture.fromDirectory(source.root, {
      plugins: [gitPlugin()],
    });

    expect((await fs.stat(path.join(fixture.root, ".git"))).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(fixture.root, "source.txt"), "utf8")).toBe("original");
    expect(await fs.readdir(source.root)).toEqual(["source.txt"]);
  });

  it("should ignore repository-routing environment variables", async () => {
    await using other = await Fixture.create({});
    vi.stubEnv("GIT_DIR", path.join(other.root, "repository.git"));
    vi.stubEnv("GIT_WORK_TREE", other.root);

    await using fixture = await Fixture.create({}, { plugins: [gitPlugin()] });

    expect((await fs.stat(path.join(fixture.root, ".git"))).isDirectory()).toBe(true);
    expect(await fs.readdir(other.root)).toEqual([]);
  });

  it("should reject an existing .git directory and clean up the failed fixture", async () => {
    await expectExistingRepositoryRejected(() =>
      Fixture.create({ ".git": {} }, { plugins: [gitPlugin()] }),
    );
  });

  it("should reject a copied gitfile without modifying its source repository", async () => {
    await using repository = await Fixture.create({}, { plugins: [gitPlugin()] });
    const gitDirectory = path.join(repository.root, ".git");
    const config = await fs.readFile(path.join(gitDirectory, "config"), "utf8");
    const head = await fs.readFile(path.join(gitDirectory, "HEAD"), "utf8");
    const gitfile = `gitdir: ${gitDirectory.split(path.sep).join("/")}\n`;
    await using source = await Fixture.create({
      ".git": gitfile,
      "source.txt": "original",
    });

    await expectExistingRepositoryRejected(() =>
      Fixture.fromDirectory(source.root, { plugins: [gitPlugin()] }),
    );

    expect(await fs.readFile(path.join(source.root, ".git"), "utf8")).toBe(gitfile);
    expect(await fs.readFile(path.join(source.root, "source.txt"), "utf8")).toBe("original");
    expect(await fs.readFile(path.join(gitDirectory, "config"), "utf8")).toBe(config);
    expect(await fs.readFile(path.join(gitDirectory, "HEAD"), "utf8")).toBe(head);
  });

  it.skipIf(process.platform === "win32")(
    "should reject a copied .git symlink without modifying its target",
    async () => {
      await using repository = await Fixture.create({}, { plugins: [gitPlugin()] });
      const gitDirectory = path.join(repository.root, ".git");
      const config = await fs.readFile(path.join(gitDirectory, "config"), "utf8");
      await using source = await Fixture.create({ "source.txt": "original" });
      await fs.symlink(gitDirectory, path.join(source.root, ".git"), "dir");

      await expectExistingRepositoryRejected(() =>
        Fixture.fromDirectory(source.root, { plugins: [gitPlugin()] }),
      );

      expect(await fs.readlink(path.join(source.root, ".git"))).toBe(gitDirectory);
      expect(await fs.readFile(path.join(source.root, "source.txt"), "utf8")).toBe("original");
      expect(await fs.readFile(path.join(gitDirectory, "config"), "utf8")).toBe(config);
    },
  );

  it("should preserve a missing Git error and clean up the failed fixture", async () => {
    const createDirectory = vi.spyOn(fs, "mkdtemp");
    const pathVariable =
      Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
    vi.stubEnv(pathVariable, "");

    await expect(Fixture.create({}, { plugins: [gitPlugin()] })).rejects.toMatchObject({
      code: "ENOENT",
    });

    const root = (await createDirectory.mock.results[0]?.value) as string;
    expect(root).toBeTypeOf("string");
    await expect(fs.access(root)).rejects.toThrow();
  });
});
