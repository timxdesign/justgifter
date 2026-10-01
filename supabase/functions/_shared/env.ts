// Server-only configuration (TECH 02). Set with `supabase secrets set KEY=value`.
const get = (k: string, required = true) => {
  const v = Deno.env.get(k)
  if (required && !v) throw new Error(`Missing required secret ${k}`)
  return v ?? ""
}

export const env = {
  supabaseUrl: () => get("SUPABASE_URL"),
  serviceRoleKey: () => get("SUPABASE_SERVICE_ROLE_KEY"),
  anonKey: () => get("SUPABASE_ANON_KEY"),
  siteUrl: () => get("SITE_URL", false) || "http://127.0.0.1:5173",
  allowedOrigins: () => (get("ALLOWED_ORIGINS", false) || get("SITE_URL", false) || "http://127.0.0.1:5173").split(",").map((s) => s.trim()),
  paystackSecret: () => get("PAYSTACK_SECRET_KEY"),
  anthropicKey: () => get("ANTHROPIC_API_KEY", false),
  aiModel: () => get("AI_MODEL", false) || "claude-opus-5-5",
  smtpHost: () => get("SMTP_HOST", false),
  smtpPort: () => Number(get("SMTP_PORT", false) || 465),
  smtpUser: () => get("SMTP_USER", false),
  smtpPass: () => get("SMTP_PASS", false),
  mailFrom: () => get("MAIL_FROM", false) || "JustGifter <hello@justgifter.com>",
  turnstileSecret: () => get("TURNSTILE_SECRET_KEY", false),
  cronSecret: () => get("CRON_SECRET"),
  /** Staging/preview must never send real notifications (TECH 01). */
  sendRealEmail: () => get("SEND_REAL_EMAIL", false) === "true",
}
