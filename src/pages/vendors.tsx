import { Link } from "react-router"
import { categoryName, zoneById } from "@domain/index.ts"
import { Container, Img, PageHeader, CardGridSkeleton } from "@/components/common"
import { VendorAvatar } from "@/components/commerce"
import { Button } from "@/components/ui/button"
import { VerifiedCheckIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { useDocumentMeta } from "@/lib/seo"

export default function VendorsPage() {
  useDocumentMeta({ title: "Our vendors", description: "Independent florists, bakers, makers and shops — each reviewed before they can sell on JustGifter.", canonical: "/vendors" })
  const vendors = useApiQuery(qk.vendors, (api) => api.listVendors())
  return (
    <Container className="flex flex-col gap-10 py-12">
      <PageHeader eyebrow="Trusted vendors" title="The people behind the gifts" description="Every vendor is reviewed before they can sell. “Verified” means our team has checked their documents and a sample order." actions={<Button variant="outline" asChild><Link to="/sell">Become a vendor</Link></Button>} />
      {!vendors.data ? <CardGridSkeleton count={6} /> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.data.map((v) => (
            <Link key={v.id} to={v.storefrontSlug && v.storefrontStatus === "published" ? `/stores/${v.storefrontSlug}` : `/shop?q=${encodeURIComponent(v.name)}`} className="group/v surface-interactive flex flex-col overflow-hidden rounded-3xl">
              <div className="aspect-[16/9] overflow-hidden"><Img src={v.coverImage} alt="" className="size-full transition-[scale] duration-700 group-hover/v:scale-105" sizes="(min-width: 1024px) 33vw, 50vw" /></div>
              <div className="flex flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <VendorAvatar name={v.name} initials={v.logoInitials} color={v.logoColor} className="-mt-10 size-12 ring-4 ring-[var(--card)]" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">{v.name}{v.verified && <VerifiedCheckIcon className="text-info size-4" aria-label="Verified" />}</p>
                    <p className="text-muted-foreground text-sm">{v.city} · {v.productCount} gifts</p>
                  </div>
                </div>
                <p className="text-muted-foreground line-clamp-2 text-sm">{v.tagline}</p>
                <p className="text-xs">{v.categories.map(categoryName).join(" · ")} — delivers to {v.zones.map((z) => zoneById(z.zoneId)?.city).filter((c, i, a) => a.indexOf(c) === i).join(", ")}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Container>
  )
}
