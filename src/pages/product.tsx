import { useParams } from "react-router"
import { ProductView } from "@/components/product-view"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"

export default function ProductPage() {
  const { slug = "" } = useParams()
  const detail = useApiQuery(qk.product(slug), (api) => api.getProduct(slug))
  const p = detail.data?.product
  useDocumentMeta({ title: p?.title ?? "Gift", description: p?.summary, image: p?.images[0], canonical: p ? `/products/${p.slug}` : undefined })
  return <ProductView slug={slug} />
}
