---
"@fixture-kit/core": minor
---

BREAKING: `Fixture.create` keys must now be a single path segment. Slash-separated keys (e.g. `"src/index.ts"`) are rejected — create nested directories with nested objects instead.

```ts
// Before — a slash key created the intermediate directories
await Fixture.create({ "src/index.ts": "export {}" });

// After — nest objects to express directories
await Fixture.create({ src: { "index.ts": "export {}" } });
```
