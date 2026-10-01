import { useEffect, useState } from "react"
import { cn } from "cn"
import { ErrorState, PageSkeleton } from "@/components/common"
import { WsHeader, Panel } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { CloseIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { formatDate, todayLagos } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function VendorSettings() {
  useDocumentMeta({ title: "Settings", noindex: true })
  const ws = useApiQuery(qk.vendorWorkspace, (api) => api.getVendorWorkspace())
  const [s, setS] = useState({ days: [] as number[], openHour: 8, closeHour: 18, cutoffHour: 14, dailyCapacity: 20, blackoutDates: [] as string[] })
  const [newDate, setNewDate] = useState("")
  useEffect(() => {
    if (ws.data) {
      const o = ws.data.vendor.operating
      setS({ days: o.days, openHour: o.openHour, closeHour: o.closeHour, cutoffHour: o.cutoffHour, dailyCapacity: o.dailyCapacity, blackoutDates: o.blackoutDates })
    }
  }, [ws.data])
  const save = useApiMutation((api) => api.updateVendorSettings(s), { invalidate: [qk.vendorWorkspace], success: "Saved — delivery dates update immediately" })
  if (ws.error) return <ErrorState error={ws.error} />
  if (!ws.data) return <PageSkeleton />
  const num = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) })
  return (
    <>
      <WsHeader title="Settings" description="These rules decide which delivery dates customers can choose. We never promise a date you can't make." />
      <form className="grid max-w-3xl gap-6" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Panel title="Operating calendar">
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Delivery days</FieldLegend>
              <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = s.days.includes(i); return <button key={d} type="button" aria-pressed={on} onClick={() => setS({ ...s, days: on ? s.days.filter((x) => x !== i) : [...s.days, i].sort() })} className={cn("press h-10 w-14 rounded-xl text-sm font-medium", on ? "bg-primary text-primary-foreground" : "bg-muted")}>{d}</button> })}</div>
            </FieldSet>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field><FieldLabel htmlFor="v-open">Opens (hour)</FieldLabel><Input id="v-open" type="number" min={0} max={23} value={s.openHour} onChange={num("openHour")} /></Field>
              <Field><FieldLabel htmlFor="v-close">Closes (hour)</FieldLabel><Input id="v-close" type="number" min={1} max={24} value={s.closeHour} onChange={num("closeHour")} /></Field>
              <Field><FieldLabel htmlFor="v-cut">Same-day cutoff</FieldLabel><Input id="v-cut" type="number" min={0} max={23} value={s.cutoffHour} onChange={num("cutoffHour")} /></Field>
              <Field><FieldLabel htmlFor="v-cap">Orders per day</FieldLabel><Input id="v-cap" type="number" min={1} value={s.dailyCapacity} onChange={num("dailyCapacity")} /></Field>
            </div>
            <FieldDescription>Times are in Lagos time (WAT), 24-hour.</FieldDescription>
          </FieldGroup>
        </Panel>
        <Panel title="Days off">
          <div className="flex gap-2">
            <Input aria-label="Date to close" type="date" min={todayLagos()} value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-48" />
            <Button type="button" variant="outline" disabled={!newDate} onClick={() => { setS({ ...s, blackoutDates: [...new Set([...s.blackoutDates, newDate])].sort() }); setNewDate("") }}>Add day off</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.blackoutDates.length === 0 ? <p className="text-muted-foreground text-sm">No days off scheduled.</p> : s.blackoutDates.map((d) => (
              <span key={d} className="bg-muted flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm">{formatDate(d)}<button type="button" aria-label={`Remove ${formatDate(d)}`} onClick={() => setS({ ...s, blackoutDates: s.blackoutDates.filter((x) => x !== d) })} className="hover:bg-accent grid size-6 place-items-center rounded-full"><CloseIcon className="size-3.5" /></button></span>
            ))}
          </div>
        </Panel>
        <Button type="submit" size="lg" className="w-fit" disabled={save.isPending}>Save settings</Button>
      </form>
    </>
  )
}
