import { Link } from "react-router"
import { Container, EmptyState, CardGridSkeleton, PageHeader } from "@/components/common"
import { ProductGrid } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { HeartIcon } from "@/components/icons"
import { useSaved } from "@/lib/cart"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"
import { AccountTabs } from "./tabs"

export default function SavedPage() {
  useDocumentMeta({ title: "Saved", noindex: true })
  const saved = useSaved()
  const q = { ids: saved.list, pageSize: 100 }
  const products = useApiQuery(qk.products(q), (api) => api.listProducts(q), { enabled: saved.list.length > 0 })
  return (
    <Container className="flex flex-col gap-8 py-10">
      <PageHeader title="Saved" description="Gifts you've saved from any vendor. Each vendor checks out separately." />
      <AccountTabs />
      {saved.list.length === 0 ? (
        <EmptyState icon={<HeartIcon />} title="Nothing saved yet" description="Tap the heart on any gift to keep it here for later." action={<Button asChild><Link to="/shop">Browse gifts</Link></Button>} />
      ) : !products.data ? (
        <CardGridSkeleton count={4} />
      ) : (
        <ProductGrid products={products.data.items} />
      )}
    </Container>
  )
}
