import { useState } from "react"
import { cn } from "cn"
import type { PlatformRole, TeamInvite, TeamMember } from "@/api"
import { ErrorState, PageSkeleton, StatusBadge } from "@/components/common"
import { WsHeader, Panel } from "@/components/workspace"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CrownStarIcon, LetterIcon, ShieldUserIcon, UserPlusIcon } from "@/components/icons"
import { qk, useApiMutation, useApiQuery } from "@/lib/api-hooks"
import { initials } from "@/lib/format"
import { useDocumentMeta } from "@/lib/seo"

const ROLES: { id: PlatformRole; label: string; body: string; icon: typeof CrownStarIcon }[] = [
  { id: "support", label: "Support", body: "Orders, gifts, delivery issues, support cases and refunds within the approval limit.", icon: ShieldUserIcon },
  { id: "admin", label: "Admin", body: "Everything support can do, plus vendor and listing approvals, large refunds, storefront moderation, the audit log and who has access.", icon: CrownStarIcon },
]

const ROLE_LABEL: Record<PlatformRole, string> = { admin: "Admin", support: "Support" }

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

type Change = { member: TeamMember; role: PlatformRole | "none" }

export default function AdminTeam() {
  useDocumentMeta({ title: "Team", noindex: true })
  const q = useApiQuery(qk.admin("team"), (api) => api.listTeam())
  const [change, setChange] = useState<Change | null>(null)
  if (q.error) return <ErrorState error={q.error} />
  if (!q.data) return <PageSkeleton />
  const { members, invites } = q.data
  return (
    <>
      <WsHeader title="Team" description="Who can open the operations workspace. Everyone sets up two-step sign-in with an authenticator app before their first visit." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={`People with access · ${members.length}`}>
            <ul className="-my-1 divide-y">
              {members.map((m) => <MemberRow key={m.userId} member={m} onChange={(role) => setChange({ member: m, role })} />)}
            </ul>
          </Panel>
          <Panel title={`Pending invitations${invites.length ? ` · ${invites.length}` : ""}`}>
            {invites.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open invitations. Invite someone and they'll appear here until they sign in.</p>
            ) : (
              <ul className="-my-1 divide-y">{invites.map((i) => <InviteRow key={i.id} invite={i} />)}</ul>
            )}
          </Panel>
        </div>
        <InvitePanel />
      </div>
      <ChangeDialog change={change} onClose={() => setChange(null)} />
    </>
  )
}

function MemberRow({ member: m, onChange }: { member: TeamMember; onChange: (role: PlatformRole | "none") => void }) {
  const display = m.name && m.name !== m.email.split("@")[0] ? m.name : m.email.split("@")[0]
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar className="size-10">
        <AvatarFallback className={cn("text-sm font-semibold", m.role === "admin" ? "bg-plum text-plum-foreground" : "bg-brand-soft text-foreground")}>{initials(display)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">{display}{m.isYou && <span className="text-muted-foreground text-xs font-normal">(you)</span>}</p>
        <p className="text-muted-foreground truncate text-sm">{m.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {m.mfaEnrolled ? <StatusBadge tone="success">2-step on</StatusBadge> : <StatusBadge tone="warning">2-step not set up</StatusBadge>}
        {m.isYou ? (
          <StatusBadge tone="neutral">{ROLE_LABEL[m.role]}</StatusBadge>
        ) : (
          <Select value={m.role} onValueChange={(v) => onChange(v as PlatformRole | "none")}>
            <SelectTrigger size="sm" className="w-32" aria-label={`Access for ${m.email}`}><SelectValue /></SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="none" className="text-destructive">Remove access</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </li>
  )
}

function InviteRow({ invite: i }: { invite: TeamInvite }) {
  const revoke = useApiMutation((api) => api.revokeTeamInvite(i.id), { invalidate: [qk.admin("team"), qk.admin("audit")], success: "Invitation cancelled" })
  const left = daysLeft(i.expiresAt)
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full"><LetterIcon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{i.email}</p>
        <p className="text-muted-foreground text-sm">{ROLE_LABEL[i.role]} · invited by {i.invitedBy} · {left === 0 ? "expires today" : `expires in ${left} day${left === 1 ? "" : "s"}`}</p>
        {i.note && <p className="text-muted-foreground mt-1 text-sm italic">“{i.note}”</p>}
      </div>
      <Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate()}>{revoke.isPending && <Spinner data-icon="inline-start" />}Cancel invite</Button>
    </li>
  )
}

function InvitePanel() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<PlatformRole>("support")
  const [note, setNote] = useState("")
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const invite = useApiMutation((api) => api.inviteTeamMember({ email: email.trim(), role, note: note.trim() || undefined }), {
    invalidate: [qk.admin("team"), qk.admin("audit")],
    success: () => `Invitation sent to ${email.trim()}`,
    onSuccess: () => { setEmail(""); setNote(""); setRole("support") },
  })
  return (
    <Panel title="Invite a teammate" className="h-fit lg:sticky lg:top-6">
      <form onSubmit={(e) => { e.preventDefault(); if (valid) invite.mutate() }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="team-email">Email</FieldLabel>
            <Input id="team-email" type="email" autoComplete="off" placeholder="name@justgifter.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Access</FieldLegend>
            <div role="radiogroup" aria-label="Access" className="flex flex-col gap-2">
              {ROLES.map((r) => {
                const on = role === r.id
                const Icon = r.icon
                return (
                  <button key={r.id} type="button" role="radio" aria-checked={on} onClick={() => setRole(r.id)} className={cn("press bg-card flex gap-3 rounded-xl p-3 text-left text-sm transition-shadow", on ? "shadow-[0_0_0_2px_var(--foreground)]" : "shadow-border")}>
                    <Icon className={cn("mt-0.5 size-5 shrink-0", on ? "text-foreground" : "text-muted-foreground")} />
                    <span><span className="block font-medium">{r.label}</span><span className="text-muted-foreground">{r.body}</span></span>
                  </button>
                )
              })}
            </div>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="team-note">Note <span className="text-muted-foreground font-normal">(optional)</span></FieldLabel>
            <Textarea id="team-note" rows={2} maxLength={300} placeholder="Welcome aboard! Start with the support queue." value={note} onChange={(e) => setNote(e.target.value)} />
            <FieldDescription>Included in their invitation email.</FieldDescription>
          </Field>
          <Button type="submit" size="lg" disabled={!valid || invite.isPending}>
            {invite.isPending ? <Spinner data-icon="inline-start" /> : <UserPlusIcon data-icon="inline-start" />}
            Send invitation
          </Button>
          <p className="text-muted-foreground text-xs leading-relaxed">The invitation only works for this exact address and expires in 7 days. They get access the first time they sign in with it.</p>
        </FieldGroup>
      </form>
    </Panel>
  )
}

function ChangeDialog({ change, onClose }: { change: Change | null; onClose: () => void }) {
  const [reason, setReason] = useState("")
  const save = useApiMutation((api, c: Change) => api.setTeamRole(c.member.userId, c.role, reason.trim()), {
    invalidate: [qk.admin("team"), qk.admin("audit")],
    success: (_, c) => (c.role === "none" ? `Removed ${c.member.email}` : `${c.member.email} is now ${c.role === "admin" ? "an admin" : "on support"}`),
    onSuccess: () => { setReason(""); onClose() },
  })
  const removing = change?.role === "none"
  return (
    <Dialog open={!!change} onOpenChange={(o) => { if (!o) { setReason(""); onClose() } }}>
      <DialogContent>
        {change && (
          <>
            <DialogHeader>
              <DialogTitle>{removing ? `Remove ${change.member.email}?` : `Make ${change.member.email} ${change.role === "admin" ? "an admin" : "support"}?`}</DialogTitle>
              <DialogDescription>
                {removing
                  ? "They lose access to the operations workspace straight away and keep their customer account. We'll let them know by email."
                  : change.role === "admin"
                    ? "Admins can approve vendors, issue large refunds and decide who else has access."
                    : "They keep support tools but lose approvals, team management and the audit log."}{" "}
                The change is recorded in the audit log.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="team-reason">Reason</FieldLabel>
              <Textarea id="team-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReason(""); onClose() }}>Cancel</Button>
              <Button variant={removing ? "destructive-solid" : "default"} disabled={!reason.trim() || save.isPending} onClick={() => save.mutate(change)}>
                {save.isPending && <Spinner data-icon="inline-start" />}{removing ? "Remove access" : "Change access"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
