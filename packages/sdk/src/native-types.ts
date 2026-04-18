/**
 * The N-API surface exposed by @ogmios/binding-{platform}-{arch}.
 * Mirrors zig/src/core/napi.zig from Plan 02. DO NOT change without
 * updating that file and bumping the wire format version.
 */
export interface NativeBinding {
  ping(): string;
  version(): string;
  wireVersion(): number;
  createDriver(name: string, logBufferSize: number): bigint;
  driverStart(id: bigint): boolean;
  driverStop(id: bigint): boolean;
  driverReset(id: bigint): boolean;
  driverDrain(id: bigint): Buffer;
  driverDeinit(id: bigint): boolean;
  droppedCount(id: bigint): bigint;
}

export const SUPPORTED_PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', pkg: '@ogmios/binding-darwin-arm64' },
  { platform: 'darwin', arch: 'x64', pkg: '@ogmios/binding-darwin-x64' },
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
