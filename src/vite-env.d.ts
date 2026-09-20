/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Only set when the frontend and backend are deployed to two different
  // origins (e.g. frontend on Vercel, backend on Render) — see api/client.ts.
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
