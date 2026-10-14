import type { DateOnly } from "./types.ts"

/**
 * The letter studio: how a letter looks (its design) and the moments that travel with it. The
 * letter body stays in letters.ts; everything here is optional and validated the same way on both
 * backends, because the recipient's page renders it straight from storage.
 */

// ---------------------------------------------------------------- Design

export type LetterTheme = "table" | "envelope" | "celebration"
export type LetterFlower = "roses" | "peonies" | "sunflowers" | "lavender" | "hibiscus"
export type LetterLight = "day" | "night"

export interface LetterDesign {
  theme: LetterTheme
  flowers: LetterFlower
  light: LetterLight
  /** Petals drift across the scene and carry the reader between moments. */
  petals: boolean
  butterflies: boolean
  /** Gold filigree on the corners of the letter. */
  gold: boolean
}

export const LETTER_THEMES: { id: LetterTheme; name: string; description: string }[] = [
  { id: "table", name: "Flower table", description: "A table of flowers, with each moment laid out as something to pick up." },
  { id: "envelope", name: "Soft envelope", description: "A blush envelope and a clean, modern read." },
  { id: "celebration", name: "Celebration", description: "A gift box, a ribbon to pull and confetti when it opens." },
]

export const LETTER_FLOWERS: { id: LetterFlower; name: string }[] = [
  { id: "roses", name: "Roses" },
  { id: "peonies", name: "Peonies" },
  { id: "sunflowers", name: "Sunflowers" },
  { id: "lavender", name: "Lavender" },
  { id: "hibiscus", name: "Hibiscus" },
]

export const DEFAULT_LETTER_DESIGN: LetterDesign = { theme: "table", flowers: "roses", light: "day", petals: true, butterflies: false, gold: true }

export function sanitiseLetterDesign(input: unknown): LetterDesign {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, list: { id: T }[], fallback: T) => list.find((x) => x.id === v)?.id ?? fallback
  const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback)
  return {
    theme: pick(d.theme, LETTER_THEMES, DEFAULT_LETTER_DESIGN.theme),
    flowers: pick(d.flowers, LETTER_FLOWERS, DEFAULT_LETTER_DESIGN.flowers),
    light: d.light === "night" ? "night" : "day",
    petals: flag(d.petals, DEFAULT_LETTER_DESIGN.petals),
    butterflies: flag(d.butterflies, DEFAULT_LETTER_DESIGN.butterflies),
    gold: flag(d.gold, DEFAULT_LETTER_DESIGN.gold),
  }
}

// ---------------------------------------------------------------- Moments

/** Everything a letter can hold. "letter" is the body itself and is always present. */
export type MomentId = "letter" | "reasons" | "story" | "photos" | "date" | "places" | "wishes" | "song"

export const MOMENT_IDS: MomentId[] = ["letter", "reasons", "story", "photos", "date", "places", "wishes", "song"]

export interface StoryChapter {
  /** Free text: "June 2019", "Our first year". */
  when: string
  title: string
  text: string
}
export interface LetterPhoto {
  /** Storage path in the private letter-media bucket; never a URL. */
  path: string
  caption: string
}
export interface LetterPlace {
  name: string
  note: string
}
export interface LetterSong {
  url: string
  title: string
  /** Why this song, in the sender's words. */
  note: string
}

export interface LetterMoments {
  reasons: string[]
  story: StoryChapter[]
  photos: LetterPhoto[]
  date: { on: DateOnly; label: string } | null
  places: LetterPlace[]
  wishes: string[]
  song: LetterSong | null
  /** Shown at the very end of the letter, beside the signature. */
  closing: string
}

export const EMPTY_MOMENTS: LetterMoments = { reasons: [], story: [], photos: [], date: null, places: [], wishes: [], song: null, closing: "" }

export const MOMENT_LIMITS = {
  reasons: { items: 12, chars: 140 },
  story: { items: 6, when: 40, title: 60, text: 400 },
  photos: { items: 8, caption: 80 },
  date: { label: 60 },
  places: { items: 6, name: 60, note: 160 },
  wishes: { items: 8, chars: 140 },
  song: { title: 80, note: 200 },
  closing: 200,
} as const

/** Which moments have something in them. The letter always counts. */
export function filledMoments(m: LetterMoments): MomentId[] {
  return MOMENT_IDS.filter((id) => {
    switch (id) {
      case "letter":
        return true
      case "date":
        return Boolean(m.date)
      case "song":
        return Boolean(m.song)
      default:
        return m[id].length > 0
    }
  })
}

// ---------------------------------------------------------------- Songs

export type SongProvider = "spotify" | "youtube" | "apple" | "audiomack"

export const SONG_PROVIDERS: Record<SongProvider, string> = { spotify: "Spotify", youtube: "YouTube", apple: "Apple Music", audiomack: "Audiomack" }

export interface SongEmbed {
  provider: SongProvider
  /** Canonical link to open the song on its own site. */
  url: string
  /** iframe src. Loaded only after the reader presses play. */
  embedUrl: string
}

/**
 * Turns a pasted music link into an embeddable player. Only a few known services are accepted, so
 * a letter can never carry an arbitrary link (or frame an arbitrary site) to the recipient.
 */
export function parseSongLink(raw: string): SongEmbed | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "")
  const parts = u.pathname.split("/").filter(Boolean)
  const id = (v: string | undefined | null, re = /^[A-Za-z0-9_-]{6,64}$/) => (v && re.test(v) ? v : null)

  if (host === "open.spotify.com") {
    const rest = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts
    const kind = rest[0]
    const sid = id(rest[1], /^[A-Za-z0-9]{10,40}$/)
    if (!sid || !["track", "album", "playlist", "episode"].includes(kind)) return null
    return { provider: "spotify", url: `https://open.spotify.com/${kind}/${sid}`, embedUrl: `https://open.spotify.com/embed/${kind}/${sid}` }
  }
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    const vid = id(host === "youtu.be" ? parts[0] : parts[0] === "shorts" || parts[0] === "embed" ? parts[1] : u.searchParams.get("v"), /^[A-Za-z0-9_-]{11}$/)
    if (!vid) return null
    return { provider: "youtube", url: `https://www.youtube.com/watch?v=${vid}`, embedUrl: `https://www.youtube-nocookie.com/embed/${vid}` }
  }
  if (host === "music.apple.com") {
    // /{country}/{album|song|playlist}/{slug}/{id}[?i=trackId]
    const [cc, kind, slug, aid] = parts
    if (!/^[a-z]{2}$/.test(cc ?? "") || !["album", "song", "playlist"].includes(kind) || !/^[\p{L}\p{N}%._-]{1,120}$/u.test(slug ?? "") || !/^(\d{5,15}|pl\.[A-Za-z0-9-]{10,60})$/.test(aid ?? "")) return null
    const track = u.searchParams.get("i")
    const q = track && /^\d{5,15}$/.test(track) ? `?i=${track}` : ""
    const path = `/${cc}/${kind}/${slug}/${aid}${q}`
    return { provider: "apple", url: `https://music.apple.com${path}`, embedUrl: `https://embed.music.apple.com${path}` }
  }
  if (host === "audiomack.com") {
    // /{artist}/song/{slug} or /{artist}/album/{slug}
    const [artist, kind, slug] = parts
    const ok = (v?: string) => Boolean(v && /^[a-z0-9-]{1,80}$/i.test(v))
    if (!ok(artist) || !ok(slug) || !["song", "album"].includes(kind)) return null
    return { provider: "audiomack", url: `https://audiomack.com/${artist}/${kind}/${slug}`, embedUrl: `https://audiomack.com/embed/${kind}/${artist}/${slug}` }
  }
  return null
}

/** Origins the recipient page may frame. Kept beside the parser so the CSP can't drift from it. */
export const SONG_FRAME_ORIGINS = ["https://open.spotify.com", "https://www.youtube-nocookie.com", "https://embed.music.apple.com", "https://audiomack.com"]

// ---------------------------------------------------------------- Validation

/** Letters are text only; strip control and bidi characters that could disguise content. */
const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "")
        .trim()
        .slice(0, max)
    : ""

const list = (v: unknown) => (Array.isArray(v) ? v : [])
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})

export interface MomentsOptions {
  /** Returns true when a photo path belongs to the sender. Without it, photos are rejected. */
  photoPathOk?: (path: string) => boolean
}

/**
 * Cleans untrusted moments. Blank entries are dropped and over-long text is trimmed; anything that
 * can't be made safe (a foreign photo, an unknown music link, an impossible date) is an error the
 * sender can fix, rather than something silently removed from their letter.
 */
export function validateLetterMoments(input: unknown, opts: MomentsOptions = {}): { ok: true; value: LetterMoments } | { ok: false; message: string } {
  const d = obj(input)
  const L = MOMENT_LIMITS
  const texts = (v: unknown, max: number, items: number) => list(v).map((x) => clean(x, max)).filter(Boolean).slice(0, items)

  const reasons = texts(d.reasons, L.reasons.chars, L.reasons.items)
  const wishes = texts(d.wishes, L.wishes.chars, L.wishes.items)
  const story = list(d.story)
    .map((c) => ({ when: clean(obj(c).when, L.story.when), title: clean(obj(c).title, L.story.title), text: clean(obj(c).text, L.story.text) }))
    .filter((c) => c.title || c.text)
    .slice(0, L.story.items)
  const places = list(d.places)
    .map((p) => ({ name: clean(obj(p).name, L.places.name), note: clean(obj(p).note, L.places.note) }))
    .filter((p) => p.name)
    .slice(0, L.places.items)

  const rawPhotos = list(d.photos).slice(0, L.photos.items + 1)
  if (rawPhotos.length > L.photos.items) return { ok: false, message: `A letter can hold up to ${L.photos.items} photos.` }
  const photos: LetterPhoto[] = []
  for (const p of rawPhotos) {
    const path = typeof obj(p).path === "string" ? (obj(p).path as string) : ""
    if (!path || !opts.photoPathOk?.(path)) return { ok: false, message: "One of the photos didn't upload. Remove it and add it again." }
    photos.push({ path, caption: clean(obj(p).caption, L.photos.caption) })
  }

  let date: LetterMoments["date"] = null
  if (d.date) {
    const on = String(obj(d.date).on ?? "")
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(on) ? new Date(`${on}T12:00:00Z`) : null
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== on || parsed.getUTCFullYear() < 1900 || parsed.getUTCFullYear() > 2100) {
      return { ok: false, message: "Choose a real date for your special day." }
    }
    date = { on, label: clean(obj(d.date).label, L.date.label) }
  }

  let song: LetterSong | null = null
  if (d.song) {
    const s = obj(d.song)
    const embed = parseSongLink(String(s.url ?? ""))
    if (!embed) return { ok: false, message: "Use a song link from Spotify, YouTube, Apple Music or Audiomack." }
    song = { url: embed.url, title: clean(s.title, L.song.title), note: clean(s.note, L.song.note) }
  }

  return { ok: true, value: { reasons, story, photos, date, places, wishes, song, closing: clean(d.closing, L.closing) } }
}
