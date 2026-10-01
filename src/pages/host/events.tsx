import { Link } from "react-router"
import { eventTypeMeta } from "@domain/index.ts"
import { Container, EmptyState, ErrorState, Img, PageHeader, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CalendarAddIcon, ListHeartIcon, EyeIcon, PenIcon } from "@/components/icons"
import { qk, useApiQuery } from "@/lib/api-hooks"
import { formatDate, relativeTime } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"
import { AccountTabs } from "../account/tabs"

const STATUS = { draft: ["Draft", "neutral"], published: ["Published", "success"], closed: ["Closed to gifts", "warning"], archived: ["Archived", "neutral"] } as const

export default function EventsPage() {
  useDocumentMeta({ title: "Occasion pages", noindex: true })
  const events = useApiQuery(qk.myEvents, (api) => api.listMyEvents())
  return (
    <Container className="flex flex-col gap-8 py-10">
      <PageHeader title="Occasion pages" description="Your birthdays, weddings and celebrations — with wishlists guests can buy from." actions={<Button size="lg" asChild><Link to="/events/new"><CalendarAddIcon data-icon="inline-start" />New occasion page</Link></Button>} />
      <AccountTabs />
      {events.error ? (
        <ErrorState error={events.error} retry={() => events.refetch()} />
      ) : !events.data ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/3] rounded-3xl" />)}</div>
      ) : events.data.length === 0 ? (
        <EmptyState icon={<CalendarAddIcon />} title="Create your first occasion page" description="Add the date and story, choose a design, and build a wishlist guests can buy from. It's free." action={<Button asChild><Link to="/events/new">Get started</Link></Button>} />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.data.map((e) => {
            const [label, tone] = STATUS[e.status]
            return (
              <li key={e.id} className="surface-interactive flex flex-col overflow-hidden rounded-3xl">
                <Link to={`/events/${e.id}/edit`} className="relative block aspect-[16/10] overflow-hidden">
                  <Img src={e.coverImage} alt="" className="size-full" sizes="(min-width: 1024px) 33vw, 50vw" />
                  <span className="absolute top-3 left-3"><StatusBadge tone={tone} className="bg-card/90 backdrop-blur">{label}</StatusBadge></span>
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div>
                    <h2 className="font-display text-xl leading-tight">{e.title}</h2>
                    <p className="text-muted-foreground text-sm">{eventTypeMeta(e.type)?.name} · {e.date ? formatDate(e.date) : "Date to be confirmed"}{e.role === "co_host" ? " · Co-host" : ""}</p>
                  </div>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-sm"><ListHeartIcon className="size-4" />{e.wishlistCount} wishes · {e.purchasedCount} gifted</p>
                  {e.hasUnpublishedChanges && <p className="text-warning text-xs">Unpublished changes</p>}
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button size="sm" asChild><Link to={`/events/${e.id}/edit`}><PenIcon data-icon="inline-start" />Edit</Link></Button>
                    {e.status !== "draft" && <Button size="sm" variant="outline" asChild><Link to={`/e/${e.slug}`}><EyeIcon data-icon="inline-start" />View page</Link></Button>}
                  </div>
                  <p className="text-muted-foreground text-xs">Edited {relativeTime(e.updatedAt)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Container>
  )
}
