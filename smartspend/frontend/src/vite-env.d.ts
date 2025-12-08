/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  // add more VITE_ vars here if you need them later
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
