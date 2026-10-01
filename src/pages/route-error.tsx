import { isRouteErrorResponse, Link, useRouteError } from "react-router"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  // A failed lazy chunk usually means a new deployment: a reload fetches the fresh assets.
  const chunk = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message)
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <Logo />
        <h1 className="font-display text-4xl">{notFound ? "We couldn't find that page" : chunk ? "JustGifter has been updated" : "Something went wrong on our side"}</h1>
        <p className="text-muted-foreground">
          {notFound ? "The link may be old or mistyped." : chunk ? "Reload to get the latest version. Nothing you entered at checkout has been charged twice." : "Your orders and payments are safe. Try again, or head back home."}
        </p>
        <div className="flex gap-3">
          <Button size="lg" onClick={() => location.reload()}>Reload</Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
