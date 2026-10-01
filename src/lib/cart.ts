import { useSyncExternalStore } from "react"
import type { CartLine } from "@/api"

/**
 * One bag per vendor (STF 07): each bag is its own checkout and delivery charge.
 * Adding an item from another vendor creates a second bag instead of clearing the first.
 * Prices here are display snapshots; checkout always re-prices on the server.
 */

export interface BagContext {
  source: "marketplace" | "storefront"
  storefrontId: string | null
  storefrontSlug: string | null
  campaign?: string
}

export interface Bag {
  vendorId: string
  vendorName: string
  lines: CartLine[]
  context: BagContext
  updatedAt: string
}

interface CartState {
  bags: Record<string, Bag>
}

const KEY = "jg-cart"
const listeners = new Set<() => void>()
let state: CartState = read()

function read(): CartState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as CartState
  } catch {
    /* ignore */
  }
  return { bags: {} }
}

function write(next: CartState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = read()
      listeners.forEach((l) => l())
    }
  })
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useCart() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export const cartCount = (s: CartState) => Object.values(s.bags).reduce((n, b) => n + b.lines.reduce((m, l) => m + l.quantity, 0), 0)

export const cart = {
  get: () => state,
  /** Returns whether this created a new, separate bag while another vendor's bag already existed. */
  add(line: CartLine, context: BagContext): { separateBag: boolean } {
    const bags = { ...state.bags }
    const existing = bags[line.vendorId]
    const otherBags = Object.keys(bags).filter((id) => id !== line.vendorId && bags[id].lines.length > 0)
    const bag: Bag = existing ?? { vendorId: line.vendorId, vendorName: line.vendorName, lines: [], context, updatedAt: new Date().toISOString() }
    const same = bag.lines.findIndex((l) => l.variantId === line.variantId && (l.personalisationText ?? "") === (line.personalisationText ?? "") && l.wrappingId === line.wrappingId)
    const lines = [...bag.lines]
    if (same >= 0) lines[same] = { ...lines[same], quantity: Math.min(20, lines[same].quantity + line.quantity) }
    else lines.push(line)
    // A storefront visit keeps its attribution for the whole bag (STF 08).
    bags[line.vendorId] = { ...bag, lines, context: context.source === "storefront" ? context : bag.context, updatedAt: new Date().toISOString() }
    write({ bags })
    return { separateBag: !existing && otherBags.length > 0 }
  },
  setQuantity(vendorId: string, index: number, quantity: number) {
    const bag = state.bags[vendorId]
    if (!bag) return
    const lines = bag.lines.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, Math.min(20, quantity)) } : l))
    write({ bags: { ...state.bags, [vendorId]: { ...bag, lines, updatedAt: new Date().toISOString() } } })
  },
  remove(vendorId: string, index: number) {
    const bag = state.bags[vendorId]
    if (!bag) return
    const lines = bag.lines.filter((_, i) => i !== index)
    const bags = { ...state.bags }
    if (lines.length) bags[vendorId] = { ...bag, lines }
    else delete bags[vendorId]
    write({ bags })
  },
  clearBag(vendorId: string) {
    const bags = { ...state.bags }
    delete bags[vendorId]
    write({ bags })
  },
}

// ---------------------------------------------------------------- Checkout intent

export interface CheckoutIntent {
  vendorId: string
  vendorName: string
  lines: CartLine[]
  source: "marketplace" | "storefront" | "wishlist"
  storefrontId?: string | null
  storefrontSlug?: string | null
  campaign?: string
  eventSlug?: string
  eventTitle?: string
  wishlistItemId?: string
  holdId?: string
  holdExpiresAt?: string
  purchaseType: "gift" | "self"
  /** Bag checkouts clear the bag after payment; buy-now leaves the bag alone. */
  fromBag: boolean
  recipientName?: string
  zoneId?: import("@domain/index.ts").ZoneId
  requestedDate?: string
}

const ZONE_KEY = "jg-zone"
/** The buyer's last chosen delivery area, used to pre-fill delivery checks. */
export const preferredZone = {
  get(): import("@domain/index.ts").ZoneId | null {
    try {
      return (localStorage.getItem(ZONE_KEY) as import("@domain/index.ts").ZoneId) ?? null
    } catch {
      return null
    }
  },
  set(z: string) {
    try {
      localStorage.setItem(ZONE_KEY, z)
    } catch {
      /* ignore */
    }
  },
}

const INTENT_KEY = "jg-checkout-intent"

export const checkoutIntent = {
  set(intent: CheckoutIntent) {
    try {
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent))
    } catch {
      /* ignore */
    }
  },
  get(): CheckoutIntent | null {
    try {
      const raw = sessionStorage.getItem(INTENT_KEY)
      return raw ? (JSON.parse(raw) as CheckoutIntent) : null
    } catch {
      return null
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(INTENT_KEY)
    } catch {
      /* ignore */
    }
  },
}

// ---------------------------------------------------------------- Saved items

const SAVED_KEY = "jg-saved"
const savedListeners = new Set<() => void>()
let saved: string[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
})()

export function useSaved() {
  const list = useSyncExternalStore(
    (fn) => {
      savedListeners.add(fn)
      return () => {
        savedListeners.delete(fn)
      }
    },
    () => saved,
    () => saved,
  )
  return {
    list,
    has: (id: string) => list.includes(id),
    toggle(id: string) {
      saved = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(saved))
      } catch {
        /* ignore */
      }
      savedListeners.forEach((l) => l())
      return saved.includes(id)
    },
  }
}
