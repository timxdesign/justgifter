import type { Api } from "./types"
import { backendMode } from "@/lib/env"

let instance: Promise<Api> | null = null

/**
 * Resolves the backend once. With Supabase credentials configured the app talks to the real
 * backend; otherwise it runs the in-browser demo backend so every journey can be explored.
 */
export function getApi(): Promise<Api> {
  if (!instance) {
    instance = backendMode === "supabase"
      ? import("./supabase").then((m) => m.createSupabaseApi())
      : import("./demo").then((m) => m.createDemoApi())
  }
  return instance
}

export type { Api }
export * from "./types"
export * from "./errors"
