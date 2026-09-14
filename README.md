![](./docs/public/og.png)

# fixture-kit

[![CI](https://github.com/toss/fixture-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/toss/fixture-kit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fixture-kit/core)](https://www.npmjs.com/package/@fixture-kit/core)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

English | [한국어](./README.ko.md)

A kit for managing file-system fixtures for testing (the files and directories a test needs). Create a temporary directory declaratively, use it as a real working directory, and let `await using` clean it up — even when the test fails.

- **Automatic cleanup** — `Fixture` implements `AsyncDisposable`, so the directory is removed the moment it goes out of scope.
- **Two fixture sources** — write files inline, or copy an existing directory from your repository.
- **Isolated by design** — every fixture lives in its own fresh temporary directory, so tests never step on each other.
- **Zero dependencies** — built only on Node.js built-ins, written in TypeScript.

## Why fixture-kit

Tests that touch the real file system all start the same way: create a temporary directory, fill it with files, and remember to delete it afterwards.

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";

it("bundles the entry file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  try {
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src/index.ts"), "export {};");

    // the actual test...
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
```

With fixture-kit, the setup collapses into a single declaration — and if setup fails halfway, the partially written directory is removed before the error reaches you.

```ts
import { Fixture } from "@fixture-kit/core";
import { it } from "vitest";

it("bundles the entry file", async () => {
  await using fixture = await Fixture.create({
    src: { "index.ts": "export {};" },
  });

  // the actual test...
});
```

## Installation

Install `@fixture-kit/core` as a dev dependency with your package manager:

```sh
npm install --save-dev @fixture-kit/core
```

```sh
yarn add --dev @fixture-kit/core
```

```sh
pnpm add --save-dev @fixture-kit/core
```

### Requirements

- Node.js 18 or later.
- ESM only — the package ships no CommonJS build.
- `await using` requires TypeScript 5.2+ (or another toolchain that supports [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management)). `await using` itself is optional — you can always call `cleanup()` yourself.

## Quick Start

Create a fixture, read a file from it, and let `await using` delete the fixture directory automatically at the end of the scope:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { Fixture } from "@fixture-kit/core";

it("reads the config file", async () => {
  await using fixture = await Fixture.create({
    "config.json": JSON.stringify({ port: 3000 }),
    src: { "index.ts": "export {};" },
  });

  const config = JSON.parse(await fs.readFile(path.join(fixture.root, "config.json"), "utf-8"));

  expect(config.port).toBe(3000);
}); // ← the fixture directory is deleted here, even if the test failed
```

If you can't use `await using` yet, clean up manually:

```ts
const fixture = await Fixture.create({ "config.json": "{}" });
try {
  // the actual test...
} finally {
  await fixture.cleanup();
}
```

## Usage

### Inline fixtures

`Fixture.create` takes a file tree: a string value becomes a file, and a plain-object value becomes a nested directory. An empty object creates an empty directory.

```ts
await using fixture = await Fixture.create({
  "package.json": '{ "name": "my-app" }',
  src: {
    routes: {
      "index.ts": "export {};",
    },
  },
});
```

Each key names a single file or directory entry. Keys that contain path separators (like `"src/index.ts"`) are rejected — express directories with nested objects instead.

### Directory fixtures

When a fixture is too large to inline, keep it as a real directory in your repository and copy it with `Fixture.fromDirectory`:

```ts
import { fileURLToPath } from "node:url";

await using fixture = await Fixture.fromDirectory(
  fileURLToPath(new URL("fixtures/monorepo", import.meta.url)),
);
```

Each call copies the source into a fresh temporary directory, so tests can freely mutate `fixture.root` without affecting the source directory or other tests.

### Cleanup

With `await using`, the fixture directory is removed automatically at the end of the scope. Without it, call `cleanup()` yourself — ideally in a `finally` block so failing tests don't leak directories.

`cleanup()` is idempotent:

- Repeated or concurrent calls remove the directory only once.
- It doesn't throw when the directory is already gone.

## API Reference

### `Fixture.create(tree)`

Creates a temporary directory and writes the given file tree into it.

```ts
static create(tree: FixtureTree): Promise<Fixture>

interface FixtureTree {
  [name: string]: string | FixtureTree;
}
```

- `tree` — a file tree. String values become file contents, plain-object values become nested directories, and an empty object creates an empty directory.
- Each key must name a single entry: keys containing `/` or `\`, empty keys, and `.` or `..` are rejected with an `invalid fixture path` error, so a tree can never write outside the fixture root.
- Values that are neither strings nor plain objects (such as `Date`, arrays, or class instances) are rejected with a `TypeError`.
- If anything fails, the temporary directory is removed before the error is rethrown.

### `Fixture.fromDirectory(directory)`

Creates a temporary directory and recursively copies an existing directory into it.

```ts
static fromDirectory(directory: string): Promise<Fixture>
```

- `directory` — path of the source directory. Relative paths are resolved from the current working directory.
- Throws if the path doesn't exist or isn't a directory. On failure, the temporary directory is removed before the error is rethrown.

### `fixture.root`

```ts
readonly root: string
```

Absolute path of the fixture's temporary directory. The path is canonical — symlinks are resolved — so it matches `process.cwd()` after `process.chdir(fixture.root)`. This matters on macOS, where the temp directory lives under the symlinked `/var`.

### `fixture.cleanup()`

```ts
cleanup(): Promise<void>
```

Removes the fixture directory recursively. Idempotent — repeated or concurrent calls share a single removal, and it doesn't throw when the directory is already gone.

### `fixture[Symbol.asyncDispose]()`

Calls `cleanup()`. This is what makes `await using` work — you won't usually call it directly.

## License

MIT © Viva Republica, Inc. See [LICENSE](./LICENSE) for details.
