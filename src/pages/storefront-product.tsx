import { useEffect } from "react"
import { Navigate, useParams } from "react-router"
import { getApi } from "@/api"
import { PageSkeleton } from "@/components/common"
import { ProductView } from "@/components/product-view"
import { StoreChrome } from "@/components/store-chrome"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"
import { useStoreAttribution } from "./storefront"

export default function StorefrontProductPage() {
  const { slug = "", productSlug = "" } = useParams()
  const store = useApiQuery(qk.storefront(slug), (api) => api.getStorefront(slug))
  const view = store.data?.kind === "found" ? store.data.view : null
  const product = useApiQuery(qk.product(productSlug), (api) => api.getProduct(productSlug))
  const campaign = useStoreAttribution(slug, view?.storefront.id)
  useDocumentMeta({ title: product.data ? `${product.data.product.title} · ${view?.vendor.name ?? ""}` : "Product", image: product.data?.product.images[0], canonical: product.data ? `/products/${product.data.product.slug}` : undefined })
  useEffect(() => {
    if (view && product.data) getApi().then((api) => api.recordStoreVisit(view.storefront.id, "product_view", product.data!.product.id))
  }, [view, product.data])
  if (store.isLoading) return <PageSkeleton />
  if (!view) return <Navigate to={`/stores/${slug}`} replace />
  if (product.data && product.data.product.vendorId !== view.vendor.id) return <Navigate to={`/stores/${slug}`} replace />
  return (
    <StoreChrome vendor={view.vendor} slug={view.storefront.slug} accent={view.storefront.accent}>
      <ProductView slug={productSlug} store={{ storefrontId: view.storefront.id, storefrontSlug: view.storefront.slug, campaign }} />
    </StoreChrome>
  )
}
