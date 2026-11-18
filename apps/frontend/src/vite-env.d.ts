/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_ENABLE_DEV_TOKEN_ACCESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
