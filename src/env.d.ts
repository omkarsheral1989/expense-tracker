interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_REQUIRE_INSTALL?: string
  readonly VITE_ENABLE_DELETE_GROUP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
