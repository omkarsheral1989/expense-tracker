interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_REQUIRE_INSTALL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
