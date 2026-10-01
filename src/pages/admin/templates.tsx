import { TEMPLATES, PALETTES, FONTS, MOTION_LABELS, eventTypeMeta } from "@domain/index.ts"
import { WsHeader, Panel } from "@/components/workspace"
import { Badge } from "@/components/ui/badge"
import { useDocumentMeta } from "@/lib/seo"

export default function AdminTemplates() {
  useDocumentMeta({ title: "Templates", noindex: true })
  return (
    <>
      <WsHeader title="Template library" description="Approved, versioned templates. Hosts and the AI designer can only choose from these allowlists; content is stored separately from presentation." />
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATES.map((t) => (
          <Panel key={t.id} title={`${t.name} · v${t.version}`} action={<Badge variant={t.celebratoryEffects ? "brand" : "muted"}>{t.celebratoryEffects ? "Celebratory effects" : "No confetti"}</Badge>}>
            <p className="text-muted-foreground text-sm">{t.description}</p>
            <dl className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Occasions</dt><dd>{t.supportedTypes.map((x) => eventTypeMeta(x)?.name).join(", ")}</dd>
              <dt className="text-muted-foreground">Palettes</dt><dd className="flex flex-wrap gap-1.5">{t.palettes.map((p) => <span key={p} className="flex items-center gap-1"><span className="size-3 rounded-full" style={{ background: PALETTES[p].accent }} />{PALETTES[p].name}</span>)}</dd>
              <dt className="text-muted-foreground">Fonts</dt><dd>{t.fonts.map((f) => FONTS[f].name).join(", ")}</dd>
              <dt className="text-muted-foreground">Openings</dt><dd>{t.motionPresets.map((m) => MOTION_LABELS[m]).join(", ")} (default {MOTION_LABELS[t.defaultMotion]})</dd>
              <dt className="text-muted-foreground">Fallback</dt><dd>Static card when motion is reduced or fails</dd>
            </dl>
          </Panel>
        ))}
      </div>
    </>
  )
}
