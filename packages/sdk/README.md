# dicta

TypeScript SDK for Dicta — screen-reader test automation.

Loads a platform-specific native binding (`@shoki/binding-darwin-arm64` or `@shoki/binding-darwin-x64`) via npm `optionalDependencies`. No postinstall scripts.

The CLI bin name is `dicta` — install and use as:

```bash
npm install dicta
npx dicta setup
npx dicta doctor
```

```ts
import { voiceOver } from 'dicta';
```

See the [repo README](../../README.md) for the full story.
