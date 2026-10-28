![](./docs/public/og.png)

# fixture-kit

[![CI](https://github.com/toss/fixture-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/toss/fixture-kit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@fixture-kit/core)](https://www.npmjs.com/package/@fixture-kit/core)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English](./README.md) | 한국어

테스트용 파일 시스템 픽스처(테스트에 필요한 파일과 디렉터리 묶음)를 관리하는 도구예요. 임시 디렉터리를 선언적으로 만들어 실제 작업 디렉터리처럼 사용하고, 테스트가 실패해도 `await using`이 남김없이 정리해요.

- **자동 정리** — `Fixture`가 `AsyncDisposable`을 구현해서, 스코프가 끝나는 순간 디렉터리를 삭제해요.
- **두 가지 픽스처 소스** — 파일을 인라인으로 작성하거나, 저장소의 기존 디렉터리를 복사할 수 있어요.
- **격리된 실행** — 픽스처마다 새 임시 디렉터리를 사용해서 테스트끼리 간섭하지 않아요.
- **의존성 없음** — Node.js 내장 모듈만 사용하고, TypeScript로 작성했어요.

## fixture-kit이 필요한 이유

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

사용하는 패키지 매니저로 `@fixture-kit/core`를 개발 의존성으로 설치하세요.

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
- `await using`을 사용하려면 TypeScript 5.2 이상, 또는 [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management)를 지원하는 다른 도구가 필요해요. `await using` 자체는 필수가 아니에요. `cleanup()`을 직접 호출해도 돼요.

## 빠른 시작

픽스처를 만들고 그 안의 파일을 읽는 전체 흐름이에요. 스코프가 끝나면 `await using`이 픽스처 디렉터리를 자동으로 삭제해요.

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

각 키는 파일이나 디렉터리 하나의 이름이에요. `"src/index.ts"`처럼 경로 구분자가 들어간 키는 거부해요. 디렉터리는 중첩 객체로 표현하세요.

### 디렉터리 픽스처

인라인으로 담기에 픽스처가 너무 크다면 저장소에 실제 디렉터리로 두고 `Fixture.fromDirectory`로 복사하세요.

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

- 여러 번 호출하거나 동시에 호출해도 플러그인 정리와 디렉터리 삭제는 한 번만 실행돼요.
- 디렉터리가 이미 없어도 삭제 단계는 성공해요.

### 플러그인

추가 준비나 정리 작업은 `plugins` 배열로 조합하세요. 각 플러그인은 동기 함수나 비동기 함수로 `setup`과 `teardown`을 제공할 수 있어요.

```ts
await using fixture = await Fixture.create(
  { "config.json": "{}" },
  {
    plugins: [
      {
        setup: ({ root }) => fs.mkdir(path.join(root, "generated")),
      },
      {
        setup: ({ root }) => fs.writeFile(path.join(root, "generated", "ready"), "yes"),
        teardown: ({ root }) => fs.rm(path.join(root, "generated", "ready"), { force: true }),
      },
    ],
  },
);
```

- 파일을 작성하거나 복사한 뒤, 배열 순서대로 `setup`을 실행해요. 모두 끝나야 픽스처를 반환해요.
- 정리할 때는 실행에 진입한 플러그인의 `teardown`을 역순으로 실행한 뒤 디렉터리를 삭제해요.
- `setup`이 실패하면 이후 플러그인은 실행하지 않아요. 실패한 플러그인을 포함해 이미 진입한 플러그인은 정리해요.
- 파일 작성이나 복사 중에 실패하면 플러그인 훅은 실행하지 않고 디렉터리를 삭제해요.
- `teardown`이 실패해도 나머지 플러그인 정리와 디렉터리 삭제는 계속 시도해요. 에러가 하나면 그대로 던지고, 여러 개면 `AggregateError`로 함께 전달해요.

훅에는 `root`만 가진 컨텍스트를 전달해요. 각 훅은 자신이 만든 자원만 정리하고, 픽스처 전체 정리는 훅 밖의 `cleanup()`이나 `await using`에 맡기세요. 훅 안에서 해당 픽스처의 `cleanup()`을 다시 호출하는 것은 지원하지 않아요.

`Fixture.fromDirectory(directory, { plugins })`에도 같은 옵션을 사용할 수 있어요.

#### 플러그인 인스턴스

픽스처는 전달받은 플러그인 객체를 복제하지 않고 그대로 사용해요. 플러그인이 변경 가능한 상태를 저장한다면 픽스처마다 팩토리를 호출해 새 객체를 만드세요. 그러면 한 픽스처의 준비나 정리가 다른 픽스처의 자원에 영향을 주지 않아요.

예를 들어 다음 팩토리는 픽스처 하나에서 사용할 파일 핸들을 보관해요.

```ts
import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { Fixture, type FixturePlugin } from "@fixture-kit/core";

function withLogFile(): FixturePlugin {
  let file: FileHandle | undefined;

  return {
    async setup({ root }) {
      file = await fs.open(path.join(root, "test.log"), "w");
      await file.writeFile("ready\n");
    },
    async teardown() {
      await file?.close();
    },
  };
}

await using first = await Fixture.create({}, { plugins: [withLogFile()] });
await using second = await Fixture.create({}, { plugins: [withLogFile()] });
```

같은 플러그인 객체를 여러 픽스처에서 공유하려면 플러그인에 상태가 없거나, 픽스처 컨텍스트마다 상태를 따로 관리해야 해요. `setup`이 일부 자원만 만든 뒤 실패해도 `teardown`을 실행하므로, `teardown`은 준비가 끝나지 않은 상태도 처리해야 해요.

## API 레퍼런스

### `Fixture.create(tree, options?)`

임시 디렉터리를 만들고 주어진 파일 트리를 작성해요.

```ts
static create(tree: FixtureTree, options?: FixtureOptions): Promise<Fixture>

interface FixtureTree {
  [name: string]: string | FixtureTree;
}

interface FixtureOptions {
  plugins?: readonly FixturePlugin[];
}

interface FixturePlugin {
  setup?: (context: FixtureContext) => void | Promise<void>;
  teardown?: (context: FixtureContext) => void | Promise<void>;
}

interface FixtureContext {
  readonly root: string;
}
```

- `tree` — 파일 트리예요. 문자열 값은 파일 내용이 되고, 일반 객체 값은 중첩 디렉터리가 되고, 빈 객체는 빈 디렉터리를 만들어요.
- 각 키는 항목 하나의 이름이어야 해요. `/`나 `\`가 포함된 키, 빈 키, `.`과 `..`은 `invalid fixture path` 에러로 거부해요. 그래서 트리가 픽스처 루트 밖에 파일을 쓸 수 없어요.
- 문자열도 일반 객체도 아닌 값(`Date`, 배열, 클래스 인스턴스 등)은 `TypeError`로 거부해요.
- `options.plugins` — 트리를 작성한 뒤 준비하고 삭제 전에 정리할 플러그인 배열이에요. 실행 순서와 실패 동작은 [플러그인](#플러그인)을 참고하세요.
- 도중에 실패하면 임시 디렉터리를 삭제한 뒤 에러를 다시 던져요.

### `Fixture.fromDirectory(directory, options?)`

임시 디렉터리를 만들고 기존 디렉터리를 재귀적으로 복사해요.

```ts
static fromDirectory(directory: string, options?: FixtureOptions): Promise<Fixture>
```

- `directory` — 소스 디렉터리 경로예요. 상대 경로는 현재 작업 디렉터리를 기준으로 해석해요.
- 경로가 존재하지 않거나 디렉터리가 아니면 에러를 던져요. 실패하면 임시 디렉터리를 삭제한 뒤 에러를 다시 던져요.

### `fixture.root`

```ts
readonly root: string
```

픽스처 임시 디렉터리의 절대 경로예요. 심볼릭 링크(symlink)를 해석한 정규화된 경로라서 `process.chdir(fixture.root)`를 호출한 뒤의 `process.cwd()`와 일치해요. macOS에서는 임시 디렉터리가 심볼릭 링크된 `/var` 아래에 있어서 특히 유용해요.

### `fixture.cleanup()`

```ts
cleanup(): Promise<void>
```

플러그인의 `teardown`을 실행한 뒤 픽스처 디렉터리를 재귀적으로 삭제해요. 여러 번 호출하거나 동시에 호출해도 전체 정리는 한 번만 실행돼요. 디렉터리가 이미 없어도 삭제 단계는 성공하지만, 훅에서 발생한 에러는 전달돼요.

### `fixture[Symbol.asyncDispose]()`

`cleanup()`을 호출해요. `await using`이 동작하는 건 이 메서드 덕분이에요. 직접 호출할 일은 거의 없어요.

## 라이선스

MIT © Viva Republica, Inc. 자세한 내용은 [LICENSE](./LICENSE)를 참고하세요.
