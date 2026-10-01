import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Link } from "react-router"
import { cn } from "cn"
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type OrderSource, type OrderStatus } from "@domain/index.ts"
import { StatusBadge } from "@/components/common"
import { Badge } from "@/components/ui/badge"

export function WsHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-medium">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, to, tone }: { label: string; value: ReactNode; hint?: ReactNode; to?: string; tone?: "attention" | "default" }) {
  const body = (
    <>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn("tabular font-display text-3xl font-medium", tone === "attention" && "text-brand-text")}>{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </>
  )
  const cls = "surface flex flex-col gap-1 rounded-2xl p-5"
  return to ? <Link to={to} className={cn(cls, "surface-interactive")}>{body}</Link> : <div className={cls}>{body}</div>
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("surface flex flex-col gap-4 rounded-2xl p-5", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export const SOURCE_LABEL: Record<OrderSource, string> = { marketplace: "Marketplace", wishlist: "Wishlist", storefront: "Your store" }

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</StatusBadge>
}

export function SourceBadge({ source, purchaseType }: { source: OrderSource; purchaseType: "gift" | "self" }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant="outline">{SOURCE_LABEL[source]}</Badge>
      <Badge variant={purchaseType === "gift" ? "brand" : "muted"}>{purchaseType === "gift" ? "Gift" : "Self purchase"}</Badge>
    </span>
  )
}

/** Audited operations need a recorded reason; this collects it before the action runs. */
export function ReasonDialog({ trigger, title, description, confirmLabel, destructive, onConfirm, required = true }: { trigger: ReactNode; title: string; description: string; confirmLabel: string; destructive?: boolean; required?: boolean; onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="reason-input">Reason{required ? "" : " (optional)"}</FieldLabel><Textarea id="reason-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={destructive ? "destructive-solid" : "default"} disabled={required && !reason.trim()} onClick={() => { onConfirm(reason); setOpen(false); setReason("") }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
