---
"@fixture-kit/core": patch
---

Keep relative symlinks inside the copy in `Fixture.fromDirectory`. `fs.cp` rewrites relative symlink targets to absolute paths unless `verbatimSymlinks` is set, so a link in the source directory pointed back at the source after the copy.
