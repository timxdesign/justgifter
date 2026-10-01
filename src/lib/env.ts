/**
 * Public configuration only (TECH 02): every VITE_ value ships in browser assets.
 * Service-role keys, payment secrets and AI keys live in Supabase Edge Function secrets.
 */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  siteUrl: (import.meta.env.VITE_SITE_URL as string | undefined) ?? (typeof location !== "undefined" ? location.origin : "https://justgifter.com"),
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  /** Force the in-browser demo backend even when Supabase is configured. */
  forceDemo: import.meta.env.VITE_DEMO_MODE === "true",
}

export const backendMode: "demo" | "supabase" = !env.forceDemo && env.supabaseUrl && env.supabaseAnonKey ? "supabase" : "demo"
