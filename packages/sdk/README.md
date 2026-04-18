# @shoki/core

TypeScript SDK for Shoki — screen-reader test automation.

Loads a platform-specific native binding (`@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64`) via npm `optionalDependencies`. No postinstall scripts.

The CLI bin name is `shoki` — install and use as:

```bash
npm install @shoki/core
npx shoki setup
npx shoki doctor
```

```ts
import { voiceOver } from '@shoki/core';
```

See the [repo README](../../README.md) for the full story.
