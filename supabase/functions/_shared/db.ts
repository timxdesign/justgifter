import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"
import { env } from "./env.ts"

let admin: SupabaseClient | null = null

/** Service-role client: bypasses RLS, so every handler performs its own authorisation. */
export function db(): SupabaseClient {
  admin ??= createClient(env.supabaseUrl(), env.serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

/** Unwraps a Supabase response, turning database errors into exceptions. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { pgCode: res.error.code })
  return res.data
}
