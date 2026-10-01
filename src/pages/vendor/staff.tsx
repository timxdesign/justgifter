import { useState } from "react"
import { cn } from "cn"
import type { StaffMember } from "@/api"
import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { WsHeader, Panel } from "@/components/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { UserPlusIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { useSession } from "@/lib/session"
import { useDocumentMeta } from "@/lib/seo"

const SCOPES: { id: StaffMember["scopes"][number]; label: string; body: string }[] = [
  { id: "orders", label: "Orders", body: "Accept, prepare and dispatch orders" },
  { id: "catalogue", label: "Catalogue", body: "Edit products and stock" },
  { id: "support", label: "Support", body: "Reply to customer cases" },
]

export default function VendorStaff() {
  useDocumentMeta({ title: "Staff", noindex: true })
  const { hasRole } = useSession()
  const owner = hasRole("vendor_owner")
  const staff = useApiQuery(qk.staff, (api) => api.listStaff())
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [scopes, setScopes] = useState<StaffMember["scopes"]>(["orders"])
  const invite = useApiMutation((api) => api.inviteStaff({ name, email, scopes }), { invalidate: [qk.staff], success: "Invitation sent", onSuccess: () => { setName(""); setEmail("") } })
  const remove = useApiMutation((api, id: string) => api.removeStaff(id), { invalidate: [qk.staff], success: "Access removed" })
  if (staff.error) return <ErrorState error={staff.error} />
  if (!staff.data) return <PageSkeleton />
  return (
    <>
      <WsHeader title="Staff" description="Give team members only the access they need. Payout settings always stay with the owner." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel title="Team">
          <ul className="divide-y">
            {staff.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="font-medium">{m.name}</p><p className="text-muted-foreground text-sm">{m.email}</p></div>
                <div className="flex flex-wrap gap-1">
                  {m.role === "owner" ? <StatusBadge tone="success">Owner</StatusBadge> : m.scopes.map((s) => <StatusBadge key={s} tone="neutral">{s}</StatusBadge>)}
                  {m.status === "invited" && <StatusBadge tone="warning">Invited</StatusBadge>}
                </div>
                {owner && m.role !== "owner" && <Button variant="ghost" size="sm" onClick={() => remove.mutate(m.id)}>Remove</Button>}
              </li>
            ))}
          </ul>
        </Panel>
        {owner && (
          <Panel title="Invite someone">
            <FieldGroup>
              <Field><FieldLabel htmlFor="st-name">Name</FieldLabel><Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field><FieldLabel htmlFor="st-email">Email</FieldLabel><Input id="st-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <FieldSet>
                <FieldLegend variant="label">Access</FieldLegend>
                {SCOPES.map((s) => {
                  const on = scopes.includes(s.id)
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => setScopes(on ? scopes.filter((x) => x !== s.id) : [...scopes, s.id])} className={cn("press bg-card rounded-xl p-3 text-left text-sm transition-shadow", on ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border")}>
                      <span className="block font-medium">{s.label}</span>
                      <span className="text-muted-foreground text-xs">{s.body}</span>
                    </button>
                  )
                })}
              </FieldSet>
              <Button onClick={() => invite.mutate()} disabled={invite.isPending || !email.includes("@")}><UserPlusIcon data-icon="inline-start" />Send invitation</Button>
            </FieldGroup>
          </Panel>
        )}
      </div>
    </>
  )
}
