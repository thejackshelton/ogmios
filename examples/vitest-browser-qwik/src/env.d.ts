/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OGMIOS_INTEGRATION?: string;
  readonly OGMIOS_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
