import { createRequire } from 'node:module';
import { BindingNotInstalledError, ShokiError, UnsupportedPlatformError } from './errors.js';
import { type NativeBinding, SUPPORTED_PLATFORMS } from './native-types.js';

const require = createRequire(import.meta.url);

/**
 * Resolve the platform binding package name for the current process.
 * Throws UnsupportedPlatformError if no matching entry exists.
 */
export function resolveBindingPackage(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const match = SUPPORTED_PLATFORMS.find(
    (entry) => entry.platform === platform && entry.arch === arch,
  );
  if (!match) throw new UnsupportedPlatformError(platform, arch);
  return match.pkg;
}

/**
 * Load the native binding. Resolved once per process (module-scoped cache).
 * Throws BindingNotInstalledError when the expected package is missing
 * (usually an optionalDependencies skip — see PITFALLS.md Pitfall 12).
 */
let cached: NativeBinding | undefined;

export function loadBinding(): NativeBinding {
  if (cached) return cached;

  const pkg = resolveBindingPackage();
  let mod: unknown;
  try {
    mod = require(pkg);
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
    ) {
      throw new BindingNotInstalledError(pkg);
    }
    throw new ShokiError(
      `Failed to load native binding "${pkg}": ${(err as Error).message}`,
      'ERR_BINDING_LOAD_FAILED',
    );
  }

  // Type-narrow the binding shape. If one of these fails, the Zig/TS ABI has drifted.
  assertIsNativeBinding(mod, pkg);
  cached = mod;
  return cached;
}

function assertIsNativeBinding(mod: unknown, pkg: string): asserts mod is NativeBinding {
  const required: Array<keyof NativeBinding> = [
    'ping',
    'version',
    'wireVersion',
    'createDriver',
    'driverStart',
    'driverStop',
    'driverReset',
    'driverDrain',
    'driverDeinit',
    'droppedCount',
  ];
  for (const fn of required) {
    if (typeof (mod as Record<string, unknown>)[fn] !== 'function') {
      throw new ShokiError(
        `Native binding "${pkg}" is missing required export "${fn}" ` +
          `— likely an ABI drift between @shoki/sdk and ${pkg}.`,
        'ERR_BINDING_ABI_MISMATCH',
      );
    }
  }
}

/** Test seam: reset the module-scoped cache so subsequent loadBinding() picks up changes. */
export function __resetBindingCacheForTests(): void {
  cached = undefined;
}
