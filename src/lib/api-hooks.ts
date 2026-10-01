import { useMutation, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query"
import { toast } from "sonner"
import { getApi, type Api } from "@/api"
import { errorMessage } from "@/api/errors"

export function useApiQuery<T>(
  key: QueryKey,
  fn: (api: Api) => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, "queryKey" | "queryFn">,
) {
  return useQuery<T, Error, T, QueryKey>({
    queryKey: key,
    queryFn: async () => fn(await getApi()),
    ...options,
  })
}

interface MutationOptions<TRes, TVars> {
  /** Query keys refreshed after success, so carts, wishlists, stock and orders never show stale state. */
  invalidate?: QueryKey[]
  success?: string | ((res: TRes, vars: TVars) => string | null)
  onSuccess?: (res: TRes, vars: TVars) => void
  onError?: (e: Error) => void
  /** Show the error as a toast (default true). Forms that render errors inline turn this off. */
  toastError?: boolean
}

export function useApiMutation<TVars = void, TRes = void>(fn: (api: Api, vars: TVars) => Promise<TRes>, opts: MutationOptions<TRes, TVars> = {}) {
  const qc = useQueryClient()
  return useMutation<TRes, Error, TVars>({
    mutationFn: async (vars) => fn(await getApi(), vars),
    onSuccess: async (res, vars) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })))
      const msg = typeof opts.success === "function" ? opts.success(res, vars) : opts.success
      if (msg) toast.success(msg)
      opts.onSuccess?.(res, vars)
    },
    onError: (e) => {
      if (opts.toastError !== false) toast.error(errorMessage(e))
      opts.onError?.(e)
    },
  })
}

/** Query key registry so invalidation stays consistent across surfaces. */
export const qk = {
  session: ["session"] as const,
  home: ["home"] as const,
  products: (q: unknown) => ["products", q] as const,
  product: (id: string) => ["product", id] as const,
  delivery: (k: unknown) => ["delivery", k] as const,
  vendors: ["vendors"] as const,
  storefront: (slug: string) => ["storefront", slug] as const,
  myOrders: ["my-orders"] as const,
  order: (id: string) => ["order", id] as const,
  payment: (ref: string) => ["payment", ref] as const,
  myEvents: ["my-events"] as const,
  event: (id: string) => ["event", id] as const,
  eventGifts: (id: string) => ["event-gifts", id] as const,
  publicEvent: (slug: string) => ["public-event", slug] as const,
  vendorWorkspace: ["vendor-workspace"] as const,
  vendorDashboard: ["vendor-dashboard"] as const,
  vendorOrders: (f: unknown) => ["vendor-orders", f] as const,
  vendorOrder: (id: string) => ["vendor-order", id] as const,
  vendorProducts: ["vendor-products"] as const,
  vendorAnalytics: (d: number) => ["vendor-analytics", d] as const,
  payouts: ["payouts"] as const,
  staff: ["staff"] as const,
  ops: ["ops"] as const,
  admin: (k: string, f?: unknown) => ["admin", k, f] as const,
  gift: (token: string) => ["gift", token] as const,
}
