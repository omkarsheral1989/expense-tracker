/**
 * On iPhone/iPad, signing in is only offered inside the installed app, because
 * the installed app has its own storage separate from the browser. Set
 * VITE_REQUIRE_INSTALL=false to switch that off (for example in development).
 */
export const REQUIRE_INSTALL = import.meta.env.VITE_REQUIRE_INSTALL !== 'false'

/** Google OAuth client ID (Web application). Empty until it is configured. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
