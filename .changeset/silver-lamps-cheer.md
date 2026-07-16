---
"@fixture-kit/core": minor
---

`fixture.root` is now a symlink-resolved canonical path.

BREAKING: On macOS the temp directory previously reported under `/var/...`; it now reports the resolved `/private/var/...`, matching `process.cwd()` after `process.chdir(fixture.root)`. File operations via `fixture.root` are unaffected, but exact string comparisons against the old prefix (e.g. `root.startsWith(os.tmpdir())`) will differ.
