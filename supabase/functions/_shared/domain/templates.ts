import type { EventDesign, EventType, FontId, MotionPreset, PaletteId, SectionId, Tone } from "./types.ts"

/**
 * Approved template library (§6 Template library, AI 04).
 * Content is stored separately from presentation: a template only decides how the same
 * EventContent renders, so hosts can switch templates without losing details or breaking
 * wishlist references. The renderer accepts nothing outside these allowlists.
 */

export interface PaletteTokens {
  id: PaletteId
  name: string
  background: string
  surface: string
  text: string
  muted: string
  accent: string
  accentText: string
  /** Decorative motif colour for confetti, borders and the reveal. */
  motif: string
  dark: boolean
}

export const PALETTES: Record<PaletteId, PaletteTokens> = {
  "ivory-gold": { id: "ivory-gold", name: "Ivory & gold", background: "oklch(0.975 0.012 85)", surface: "oklch(0.995 0.005 85)", text: "oklch(0.25 0.03 60)", muted: "oklch(0.48 0.03 60)", accent: "oklch(0.62 0.11 75)", accentText: "oklch(0.2 0.03 60)", motif: "oklch(0.78 0.12 85)", dark: false },
  blush: { id: "blush", name: "Blush", background: "oklch(0.965 0.02 15)", surface: "oklch(0.99 0.008 15)", text: "oklch(0.27 0.04 10)", muted: "oklch(0.5 0.04 10)", accent: "oklch(0.62 0.13 10)", accentText: "oklch(0.99 0.008 15)", motif: "oklch(0.8 0.09 10)", dark: false },
  midnight: { id: "midnight", name: "Midnight", background: "oklch(0.2 0.04 270)", surface: "oklch(0.25 0.045 270)", text: "oklch(0.95 0.01 85)", muted: "oklch(0.75 0.03 270)", accent: "oklch(0.82 0.12 85)", accentText: "oklch(0.2 0.04 270)", motif: "oklch(0.82 0.12 85)", dark: true },
  tangerine: { id: "tangerine", name: "Tangerine", background: "oklch(0.97 0.025 70)", surface: "oklch(0.995 0.008 70)", text: "oklch(0.24 0.03 40)", muted: "oklch(0.48 0.04 40)", accent: "oklch(0.7 0.18 47)", accentText: "oklch(0.2 0.03 40)", motif: "oklch(0.75 0.17 50)", dark: false },
  sage: { id: "sage", name: "Sage", background: "oklch(0.96 0.015 140)", surface: "oklch(0.99 0.006 140)", text: "oklch(0.26 0.03 150)", muted: "oklch(0.47 0.03 150)", accent: "oklch(0.5 0.07 150)", accentText: "oklch(0.98 0.006 140)", motif: "oklch(0.72 0.07 140)", dark: false },
  ink: { id: "ink", name: "Ink", background: "oklch(0.97 0.004 260)", surface: "oklch(0.995 0.002 260)", text: "oklch(0.22 0.01 260)", muted: "oklch(0.48 0.01 260)", accent: "oklch(0.3 0.02 260)", accentText: "oklch(0.98 0.002 260)", motif: "oklch(0.6 0.01 260)", dark: false },
}

export const FONTS: Record<FontId, { id: FontId; name: string; heading: string; variation: string }> = {
  "classic-serif": { id: "classic-serif", name: "Classic serif", heading: "var(--font-display)", variation: '"SOFT" 0, "WONK" 0' },
  "soft-serif": { id: "soft-serif", name: "Playful serif", heading: "var(--font-display)", variation: '"SOFT" 100, "WONK" 1' },
  "modern-sans": { id: "modern-sans", name: "Modern sans", heading: "var(--font-sans)", variation: "normal" },
}

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Cover",
  story: "Story",
  details: "Date & venue",
  agenda: "Programme",
  wishlist: "Wishlist",
  message: "Closing note",
}

export const MOTION_LABELS: Record<MotionPreset, string> = {
  curtain: "Curtain",
  card: "Card",
  invitation: "Invitation",
  none: "No animation",
}

export interface TemplateDef {
  id: string
  version: number
  name: string
  description: string
  supportedTypes: EventType[]
  tone: Tone
  palettes: PaletteId[]
  fonts: FontId[]
  sections: SectionId[]
  defaultOrder: SectionId[]
  motionPresets: MotionPreset[]
  defaultMotion: MotionPreset
  /** Confetti and other celebratory effects; always false for sensitive occasions. */
  celebratoryEffects: boolean
  /** What renders when motion is reduced, fails, or is skipped (MOT 04, AC 09). */
  accessibilityFallback: "static-card"
  preview: string
}

const ALL_SECTIONS: SectionId[] = ["hero", "story", "details", "agenda", "wishlist", "message"]

export const TEMPLATES: TemplateDef[] = [
  {
    id: "soiree",
    version: 2,
    name: "Soirée",
    description: "Elegant serif type, generous space and a slow curtain reveal.",
    supportedTypes: ["wedding", "anniversary", "graduation", "appreciation", "custom", "birthday"],
    tone: "elegant",
    palettes: ["ivory-gold", "midnight", "blush", "ink"],
    fonts: ["classic-serif", "modern-sans"],
    sections: ALL_SECTIONS,
    defaultOrder: ["hero", "story", "details", "agenda", "wishlist", "message"],
    motionPresets: ["curtain", "invitation", "none"],
    defaultMotion: "curtain",
    celebratoryEffects: false,
    accessibilityFallback: "static-card",
    preview: "/media/templates/soiree.webp",
  },
  {
    id: "confetti-pop",
    version: 3,
    name: "Confetti Pop",
    description: "Bold colour, playful type and a celebratory card opening.",
    supportedTypes: ["birthday", "graduation", "baby-shower", "housewarming", "custom"],
    tone: "playful",
    palettes: ["tangerine", "blush", "midnight", "sage"],
    fonts: ["soft-serif", "modern-sans"],
    sections: ALL_SECTIONS,
    defaultOrder: ["hero", "wishlist", "story", "details", "agenda", "message"],
    motionPresets: ["card", "curtain", "none"],
    defaultMotion: "card",
    celebratoryEffects: true,
    accessibilityFallback: "static-card",
    preview: "/media/templates/confetti-pop.webp",
  },
  {
    id: "garden",
    version: 1,
    name: "Garden",
    description: "Soft palettes and an invitation that unfolds gently.",
    supportedTypes: ["baby-shower", "wedding", "anniversary", "housewarming", "appreciation", "birthday", "custom"],
    tone: "calm",
    palettes: ["sage", "blush", "ivory-gold"],
    fonts: ["classic-serif", "soft-serif", "modern-sans"],
    sections: ALL_SECTIONS,
    defaultOrder: ["hero", "story", "wishlist", "details", "agenda", "message"],
    motionPresets: ["invitation", "card", "none"],
    defaultMotion: "invitation",
    celebratoryEffects: false,
    accessibilityFallback: "static-card",
    preview: "/media/templates/garden.webp",
  },
  {
    id: "quiet",
    version: 1,
    name: "Quiet",
    description: "Restrained and calm. No confetti, minimal motion — suited to remembrance.",
    supportedTypes: ["remembrance", "appreciation", "custom"],
    tone: "restrained",
    palettes: ["ink", "sage", "ivory-gold"],
    fonts: ["classic-serif", "modern-sans"],
    sections: ["hero", "story", "details", "agenda", "wishlist", "message"],
    defaultOrder: ["hero", "story", "details", "agenda", "wishlist", "message"],
    motionPresets: ["none", "invitation"],
    defaultMotion: "none",
    celebratoryEffects: false,
    accessibilityFallback: "static-card",
    preview: "/media/templates/quiet.webp",
  },
]

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)

export const templatesFor = (type: EventType) => TEMPLATES.filter((t) => t.supportedTypes.includes(type))

export function defaultDesign(type: EventType): EventDesign {
  const fits = templatesFor(type)
  const t = fits.find((x) => x.supportedTypes[0] === type) ?? fits[0] ?? TEMPLATES[0]
  return {
    templateId: t.id,
    templateVersion: t.version,
    palette: t.palettes[0],
    font: t.fonts[0],
    sectionOrder: [...t.defaultOrder],
    motionPreset: t.defaultMotion,
    tone: t.tone,
  }
}

/** Moving to a new template keeps content and adapts the design to that template's allowlists. */
export function switchTemplate(current: EventDesign, templateId: string): EventDesign {
  const t = templateById(templateId)
  if (!t) return current
  return {
    templateId: t.id,
    templateVersion: t.version,
    palette: t.palettes.includes(current.palette) ? current.palette : t.palettes[0],
    font: t.fonts.includes(current.font) ? current.font : t.fonts[0],
    sectionOrder: normaliseSectionOrder(current.sectionOrder, t),
    motionPreset: t.motionPresets.includes(current.motionPreset) ? current.motionPreset : t.defaultMotion,
    tone: t.tone,
  }
}

/** The cover always leads ("safe boundaries" for reordering, EVT 03); unknown sections are dropped. */
export function normaliseSectionOrder(order: SectionId[], t: TemplateDef): SectionId[] {
  const allowed = order.filter((s, i) => t.sections.includes(s) && order.indexOf(s) === i && s !== "hero")
  const missing = t.defaultOrder.filter((s) => s !== "hero" && !allowed.includes(s))
  return ["hero", ...allowed, ...missing]
}

export type DesignValidation = { ok: true; design: EventDesign } | { ok: false; errors: string[] }

/**
 * Validates an untrusted design (e.g. AI output, AC 10). Anything outside the template's
 * allowlists is rejected rather than coerced, so the caller can fall back safely.
 */
export function validateDesign(input: unknown, eventType: EventType): DesignValidation {
  const errors: string[] = []
  if (!input || typeof input !== "object") return { ok: false, errors: ["Design must be an object"] }
  const d = input as Record<string, unknown>
  const t = typeof d.templateId === "string" ? templateById(d.templateId) : undefined
  if (!t) return { ok: false, errors: [`Unknown template "${String(d.templateId)}"`] }
  if (!t.supportedTypes.includes(eventType)) errors.push(`Template ${t.id} does not support ${eventType}`)
  if (typeof d.palette !== "string" || !t.palettes.includes(d.palette as PaletteId)) errors.push(`Palette "${String(d.palette)}" is not allowed for ${t.id}`)
  if (typeof d.font !== "string" || !t.fonts.includes(d.font as FontId)) errors.push(`Font "${String(d.font)}" is not allowed for ${t.id}`)
  if (typeof d.motionPreset !== "string" || !t.motionPresets.includes(d.motionPreset as MotionPreset)) errors.push(`Motion "${String(d.motionPreset)}" is not allowed for ${t.id}`)
  if (!Array.isArray(d.sectionOrder) || d.sectionOrder.some((s) => typeof s !== "string" || !t.sections.includes(s as SectionId))) {
    errors.push("Section order contains unknown sections")
  }
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    design: {
      templateId: t.id,
      templateVersion: t.version,
      palette: d.palette as PaletteId,
      font: d.font as FontId,
      sectionOrder: normaliseSectionOrder(d.sectionOrder as SectionId[], t),
      motionPreset: d.motionPreset as MotionPreset,
      tone: t.tone,
    },
  }
}
