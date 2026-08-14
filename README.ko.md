# fixture-kit

[English](./README.md) | 한국어

테스트용 파일 시스템 픽스처를 관리하는 도구예요. 임시 디렉터리를 선언적으로 만들어 실제 작업 디렉터리처럼 사용하고, 테스트가 실패해도 `await using`이 남김없이 정리해요.

- **자동 정리** — `Fixture`가 `AsyncDisposable`을 구현해서, 스코프가 끝나는 순간 디렉터리를 삭제해요
- **두 가지 픽스처 소스** — 파일을 인라인으로 작성하거나, 저장소의 기존 디렉터리를 복사할 수 있어요
- **격리된 실행** — 픽스처마다 새 임시 디렉터리를 사용해서 테스트끼리 간섭하지 않아요
- **의존성 없음** — Node.js 내장 모듈만 사용하고, TypeScript로 작성했어요

## 왜 fixture-kit인가요?

실제 파일 시스템을 다루는 테스트는 늘 같은 방식으로 시작해요. 임시 디렉터리를 만들고, 파일을 채우고, 테스트가 끝나면 잊지 않고 지워야 해요.

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";

it("엔트리 파일을 번들링한다", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
  try {
    await fs.mkdir(path.join(dir, "src"), { recursive: true });
    await fs.writeFile(path.join(dir, "src/index.ts"), "export {};");

    // 실제 테스트...
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
```

fixture-kit을 사용하면 이 준비 과정이 선언 하나로 줄어요. 준비 도중 실패하면 쓰다 만 디렉터리도 알아서 지워요.

```ts
import { Fixture } from "@fixture-kit/core";
import { it } from "vitest";

it("엔트리 파일을 번들링한다", async () => {
  await using fixture = await Fixture.create({
    src: { "index.ts": "export {};" },
  });

  // 실제 테스트...
});
```

## 설치

```sh
npm install --save-dev @fixture-kit/core
```

```sh
yarn add --dev @fixture-kit/core
```

```sh
pnpm add --save-dev @fixture-kit/core
```

### 요구 사항

- Node.js 18 이상이 필요해요.
- ESM 전용이에요. CommonJS 빌드는 제공하지 않아요.
- `await using`을 사용하려면 TypeScript 5.2 이상, 또는 [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management)를 지원하는 다른 도구가 필요해요. 필수는 아니에요. `cleanup()`을 직접 호출해도 돼요.

## 빠른 시작

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { Fixture } from "@fixture-kit/core";

it("설정 파일을 읽는다", async () => {
  await using fixture = await Fixture.create({
    "config.json": JSON.stringify({ port: 3000 }),
    src: { "index.ts": "export {};" },
  });

  const config = JSON.parse(await fs.readFile(path.join(fixture.root, "config.json"), "utf-8"));

  expect(config.port).toBe(3000);
}); // ← 테스트가 실패해도 여기서 픽스처 디렉터리가 삭제돼요
```

아직 `await using`을 사용할 수 없다면 직접 정리하세요.

```ts
const fixture = await Fixture.create({ "config.json": "{}" });
try {
  // 실제 테스트...
} finally {
  await fixture.cleanup();
}
```

## 사용법

### 인라인 픽스처

`Fixture.create`는 파일 트리를 받아요. 문자열 값은 파일이 되고, 일반 객체 값은 중첩 디렉터리가 돼요. 빈 객체는 빈 디렉터리를 만들어요.

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

각 키는 파일이나 디렉터리 하나의 이름이에요. `"src/index.ts"`처럼 경로 구분자가 들어간 키는 에러를 던지니, 디렉터리는 중첩 객체로 표현하세요.

### 디렉터리 픽스처

인라인으로 담기에 픽스처가 너무 크다면, 저장소에 실제 디렉터리로 두고 `Fixture.fromDirectory`로 복사하세요.

```ts
import { fileURLToPath } from "node:url";

await using fixture = await Fixture.fromDirectory(
  fileURLToPath(new URL("fixtures/monorepo", import.meta.url)),
);
```

호출할 때마다 소스를 새 임시 디렉터리로 복사해요. 그래서 테스트가 `fixture.root`를 마음껏 수정해도 소스 디렉터리나 다른 테스트에 영향을 주지 않아요.

### 정리

`await using`을 사용하면 스코프가 끝날 때 픽스처 디렉터리가 자동으로 삭제돼요. 사용하지 않는다면 `cleanup()`을 직접 호출하세요. 테스트가 실패해도 디렉터리가 남지 않도록 `finally` 블록에서 호출하는 게 좋아요.

`cleanup()`은 멱등해요.

- 여러 번 호출하거나 동시에 호출해도 삭제는 한 번만 실행돼요.
- 디렉터리가 이미 삭제됐어도 에러를 던지지 않아요.

## API 레퍼런스

### `Fixture.create(tree)`

임시 디렉터리를 만들고 주어진 파일 트리를 작성해요.

```ts
static create(tree: FixtureTree): Promise<Fixture>

interface FixtureTree {
  [name: string]: string | FixtureTree;
}
```

- `tree` — 파일 트리예요. 문자열 값은 파일 내용이 되고, 일반 객체 값은 중첩 디렉터리가 되고, 빈 객체는 빈 디렉터리를 만들어요.
- 각 키는 항목 하나의 이름이어야 해요. `/`나 `\`가 포함된 키, 빈 키, `.`과 `..`은 `invalid fixture path` 에러로 거부해요. 그래서 트리가 픽스처 루트 밖에 파일을 쓸 수 없어요.
- 문자열도 일반 객체도 아닌 값(`Date`, 배열, 클래스 인스턴스 등)은 `TypeError`로 거부해요.
- 도중에 실패하면 임시 디렉터리를 삭제한 뒤 에러를 다시 던져요.

### `Fixture.fromDirectory(directory)`

임시 디렉터리를 만들고 기존 디렉터리를 재귀적으로 복사해요.

```ts
static fromDirectory(directory: string): Promise<Fixture>
```

- `directory` — 소스 디렉터리 경로예요. 상대 경로는 현재 작업 디렉터리를 기준으로 해석해요.
- 경로가 존재하지 않거나 디렉터리가 아니면 에러를 던져요. 실패하면 임시 디렉터리를 삭제한 뒤 에러를 다시 던져요.

### `fixture.root`

```ts
readonly root: string
```

픽스처 임시 디렉터리의 절대 경로예요. symlink를 해석한 canonical 경로라서 `process.chdir(fixture.root)`를 호출한 뒤의 `process.cwd()`와 일치해요. 임시 디렉터리가 symlink된 `/var` 아래에 있는 macOS에서 의미가 있어요.

### `fixture.cleanup()`

```ts
cleanup(): Promise<void>
```

픽스처 디렉터리를 재귀적으로 삭제해요. 멱등해서 여러 번 호출하거나 동시에 호출해도 삭제는 한 번만 실행되고, 디렉터리가 이미 없어도 에러를 던지지 않아요.

### `fixture[Symbol.asyncDispose]()`

`cleanup()`을 호출해요. `await using`이 동작하는 이유가 바로 이 메서드예요. 직접 호출할 일은 거의 없어요.

## 라이선스

MIT © Viva Republica, Inc. 자세한 내용은 [LICENSE](./LICENSE)를 참고하세요.
