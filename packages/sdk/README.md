# ogmios

TypeScript SDK for Ogmios — screen-reader test automation.

Loads a platform-specific native binding (`@ogmios/binding-darwin-arm64` or `@ogmios/binding-darwin-x64`) via npm `optionalDependencies`. No postinstall scripts.

The CLI bin name is `ogmios` — install and use as:

```bash
npm install ogmios
npx ogmios setup
npx ogmios doctor
```

```ts
import { voiceOver } from 'ogmios';
```

See the [repo README](../../README.md) for the full story.
