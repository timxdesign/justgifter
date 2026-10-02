import { lazy, Suspense, type ComponentType } from "react"
import { createBrowserRouter, Navigate, Outlet } from "react-router"
import { PublicLayout } from "@/app/layouts/public-layout"
import { RootLayout } from "@/app/layouts/root-layout"
import { WorkspaceLayout } from "@/app/layouts/workspace-layout"
import { RequireAuth, RequireRole } from "@/app/guards"
import { PageSkeleton } from "@/components/common"
import { RouteError } from "@/pages/route-error"

const page = (load: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(load)
  return (
    <Suspense fallback={<PageSkeleton />}>
      <C />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      // ---------------------------------------------------------------- Public marketplace & accounts
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: page(() => import("@/pages/home")) },
          { path: "shop", element: page(() => import("@/pages/shop")) },
          { path: "occasions/:occasion", element: page(() => import("@/pages/shop")) },
          { path: "products/:slug", element: page(() => import("@/pages/product")) },
          { path: "assistant", element: page(() => import("@/pages/assistant")) },
          { path: "vendors", element: page(() => import("@/pages/vendors")) },
          { path: "occasion-pages", element: page(() => import("@/pages/occasion-pages")) },
          { path: "help", element: page(() => import("@/pages/help")) },
          { path: "policies/:policy", element: page(() => import("@/pages/help")) },
          { path: "cart", element: page(() => import("@/pages/cart")) },
          { path: "checkout/confirm/:reference", element: page(() => import("@/pages/payment-confirm")) },
          { path: "signin", element: page(() => import("@/pages/auth/signin")) },
          { path: "orders/access", element: page(() => import("@/pages/auth/order-access")) },
          { path: "sell", element: page(() => import("@/pages/sell")) },
          {
            path: "account",
            children: [
              { index: true, element: page(() => import("@/pages/account/orders")) },
              { path: "orders/:id", element: page(() => import("@/pages/account/order-detail")) },
              { path: "saved", element: page(() => import("@/pages/account/saved")) },
              { path: "settings", element: <RequireAuth>{page(() => import("@/pages/account/settings"))}</RequireAuth> },
            ],
          },
          {
            path: "events",
            element: <RequireAuth><Outlet /></RequireAuth>,
            children: [
              { index: true, element: page(() => import("@/pages/host/events")) },
              { path: "new", element: page(() => import("@/pages/host/event-new")) },
            ],
          },
          { path: "vendor/apply", element: <RequireAuth>{page(() => import("@/pages/vendor/apply"))}</RequireAuth> },
          { path: "*", element: page(() => import("@/pages/not-found")) },
        ],
      },

      // ---------------------------------------------------------------- Full-bleed experiences
      { path: "checkout", element: page(() => import("@/pages/checkout")) },
      { path: "events/:id/edit", element: <RequireAuth>{page(() => import("@/pages/host/event-editor"))}</RequireAuth> },
      { path: "e/:slug", element: page(() => import("@/pages/event-public")) },
      { path: "g/:token", element: page(() => import("@/pages/gift")) },
      { path: "preview/gift/:token", element: page(() => import("@/pages/gift-preview")) },
      { path: "mfa", element: <RequireAuth>{page(() => import("@/pages/auth/mfa"))}</RequireAuth> },
      { path: "pay/demo/:reference", element: page(() => import("@/pages/pay-demo")) },
      { path: "stores/:slug", element: page(() => import("@/pages/storefront")) },
      { path: "stores/:slug/products/:productSlug", element: page(() => import("@/pages/storefront-product")) },

      // ---------------------------------------------------------------- Vendor workspace
      {
        path: "vendor",
        element: (
          <RequireRole roles={["vendor_owner", "vendor_staff"]} fallback="/sell">
            <WorkspaceLayout area="vendor" />
          </RequireRole>
        ),
        children: [
          { index: true, element: page(() => import("@/pages/vendor/dashboard")) },
          { path: "orders", element: page(() => import("@/pages/vendor/orders")) },
          { path: "orders/:id", element: page(() => import("@/pages/vendor/order-detail")) },
          { path: "products", element: page(() => import("@/pages/vendor/products")) },
          { path: "products/new", element: page(() => import("@/pages/vendor/product-editor")) },
          { path: "products/:id", element: page(() => import("@/pages/vendor/product-editor")) },
          { path: "storefront", element: page(() => import("@/pages/vendor/storefront-editor")) },
          { path: "analytics", element: page(() => import("@/pages/vendor/analytics")) },
          { path: "payouts", element: page(() => import("@/pages/vendor/payouts")) },
          { path: "staff", element: page(() => import("@/pages/vendor/staff")) },
          { path: "settings", element: page(() => import("@/pages/vendor/settings")) },
        ],
      },

      // ---------------------------------------------------------------- Platform operations
      {
        path: "admin",
        element: (
          <RequireRole roles={["admin", "support"]} fallback="/">
            <WorkspaceLayout area="admin" />
          </RequireRole>
        ),
        children: [
          { index: true, element: page(() => import("@/pages/admin/overview")) },
          { path: "vendors", element: page(() => import("@/pages/admin/vendors")) },
          { path: "listings", element: page(() => import("@/pages/admin/listings")) },
          { path: "storefronts", element: page(() => import("@/pages/admin/storefronts")) },
          { path: "orders", element: page(() => import("@/pages/admin/orders")) },
          { path: "orders/:id", element: page(() => import("@/pages/admin/order-detail")) },
          { path: "refunds", element: page(() => import("@/pages/admin/refunds")) },
          { path: "cases", element: page(() => import("@/pages/admin/cases")) },
          { path: "reconciliation", element: page(() => import("@/pages/admin/reconciliation")) },
          { path: "reports", element: page(() => import("@/pages/admin/reports")) },
          { path: "templates", element: page(() => import("@/pages/admin/templates")) },
          { path: "jobs", element: page(() => import("@/pages/admin/jobs")) },
          { path: "audit", element: page(() => import("@/pages/admin/audit")) },
        ],
      },
      { path: "orders", element: <Navigate to="/account" replace /> },
    ],
  },
])
