import { Link } from "react-router"
import { Container } from "@/components/common"
import { Button } from "@/components/ui/button"
import { useDocumentMeta } from "@/lib/seo"

export default function NotFoundPage() {
  useDocumentMeta({ title: "Page not found", noindex: true })
  return (
    <Container className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 py-20 text-center">
      <p className="font-display text-brand-text text-7xl italic">404</p>
      <h1 className="font-display text-4xl">This page has been unwrapped already</h1>
      <p className="text-muted-foreground max-w-md">The link may be old or mistyped. If you're looking for an order, find it with the email you used.</p>
      <div className="flex gap-3">
        <Button size="lg" asChild><Link to="/">Go home</Link></Button>
        <Button size="lg" variant="outline" asChild><Link to="/orders/access">Find my order</Link></Button>
      </div>
    </Container>
  )
}
