/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SHOKI_INTEGRATION?: string;
  readonly SHOKI_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
