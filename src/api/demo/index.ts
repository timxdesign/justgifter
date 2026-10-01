import type { Api } from "../types"
import { Store } from "./store"
import { buildDemoDb } from "./seed-demo"
import { authApi, catalogApi } from "./api-catalog"
import { ordersApi } from "./api-orders"
import { eventsApi } from "./api-events"
import { vendorApi } from "./api-vendor"
import { adminApi } from "./api-admin"

export interface DemoBackend extends Api {
  store: Store
}

export async function createDemoApi(): Promise<DemoBackend> {
  const store = await Store.open(buildDemoDb)
  return {
    mode: "demo",
    store,
    ...authApi(store),
    ...catalogApi(store),
    ...ordersApi(store),
    ...eventsApi(store),
    ...vendorApi(store),
    ...adminApi(store),
  }
}
