# fixture-kit

## 1.0.0

### Major Changes

- 5d02b5a: This is the first stable release of fixture-kit.

  After extensive use in real-world tests, the public API has stabilized. With 1.0, we’re making that stability official.

  If you’re using 0.1.0, you can upgrade to `@fixture-kit/core@1.0.0` without changing your code.

## 0.1.0

### Minor Changes

- 0d34c2e: BREAKING: `Fixture.create` keys must now be a single path segment. Slash-separated keys (e.g. `"src/index.ts"`) are rejected — create nested directories with nested objects instead.

  ```ts
  // Before — a slash key created the intermediate directories
  await Fixture.create({ "src/index.ts": "export {}" });

  // After — nest objects to express directories
  await Fixture.create({ src: { "index.ts": "export {}" } });
  ```

- 0d34c2e: `fixture.root` is now a symlink-resolved canonical path.

  BREAKING: On macOS the temp directory previously reported under `/var/...`; it now reports the resolved `/private/var/...`, matching `process.cwd()` after `process.chdir(fixture.root)`. File operations via `fixture.root` are unaffected, but exact string comparisons against the old prefix (e.g. `root.startsWith(os.tmpdir())`) will differ.

### Patch Changes

- 0d34c2e: `Fixture.create` now accepts nested objects, interpreted as directories (`FixtureTree`)

## 0.0.1

### Patch Changes

- 570a5e0: initial publish
