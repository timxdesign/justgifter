import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { SONG_FRAME_ORIGINS, validateLetterSend } from "@domain/index.ts"
import { celebrationAllowed, defaultDesignFor, includedMoments, momentState, newStudioDraft, outgoingMoments, previewView, studioProblems, toSendInput, type StudioDraft } from "./letter-studio"

const draft = (patch: Partial<StudioDraft> = {}): StudioDraft => ({ ...newStudioDraft({ recipientName: "Ada", signature: "Tolu" }), body: "Dear Ada,\n\nHappy birthday.", ...patch })

describe("letter studio", () => {
  it("asks only for what each step needs", () => {
    const blank = newStudioDraft()
    expect(studioProblems(blank, "cover").map((p) => p.field)).toEqual(["recipientName", "signature"])
    // Only the letter is required; every other moment is optional.
    expect(studioProblems(blank, "moments").map((p) => p.field)).toEqual(["body"])
    expect(studioProblems(draft(), "moments")).toEqual([])
    // Link letters need no email; email letters do.
    expect(studioProblems(draft(), "send")).toEqual([])
    expect(studioProblems(draft({ delivery: { mode: "email", email: "nope", when: "now" } }), "send").map((p) => p.field)).toEqual(["email"])
  })

  it("rejects a scheduled time in the past or too soon", () => {
    const now = new Date("2026-10-14T08:00:00Z")
    const soon = draft({ delivery: { mode: "link", email: "", when: "later", date: "2026-10-14", time: "09:02" } })
    expect(studioProblems(soon, "send", now).map((p) => p.field)).toEqual(["when"])
    const later = draft({ delivery: { mode: "link", email: "", when: "later", date: "2026-10-15", time: "09:00" } })
    expect(studioProblems(later, "send", now)).toEqual([])
  })

  it("leaves out moments that are empty or switched off, without losing them", () => {
    const d = draft({ moments: { ...draft().moments, reasons: ["Your laugh", "  "], wishes: ["More Sundays"] }, off: ["wishes"] })
    expect(includedMoments(d)).toEqual(["letter", "reasons"])
    expect(momentState(d, "wishes")).toBe("off")
    expect(momentState(d, "story")).toBe("empty")
    const out = outgoingMoments(d, {})
    expect(out.reasons).toEqual(["Your laugh"])
    expect(out.wishes).toEqual([])
    expect(d.moments.wishes).toEqual(["More Sundays"])
  })

  it("sends photos as storage paths only once they're uploaded", () => {
    const d = draft({ moments: { ...draft().moments, photos: [{ id: "ph_1", caption: "Calabar" }, { id: "ph_2", caption: "", path: "u1/img_abcdefghij.webp" }] } })
    expect(outgoingMoments(d, {}).photos).toEqual([{ path: "u1/img_abcdefghij.webp", caption: "" }])
    expect(outgoingMoments(d, { ph_1: "u1/img_0123456789.webp" }).photos).toHaveLength(2)
  })

  it("builds a payload the shared validator accepts", () => {
    const d = draft({ moments: { ...draft().moments, song: { url: "https://youtu.be/dQw4w9WgXcQ", title: "", note: "" } } })
    const v = validateLetterSend(toSendInput(d, {}), new Date(), 90)
    expect(v.ok).toBe(true)
    expect(v.ok && v.value.delivery).toBe("link")
    expect(v.ok && v.value.moments.song?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  })

  it("previews with local photo URLs and placeholder names", () => {
    const d = draft({ recipientName: "", moments: { ...draft().moments, photos: [{ id: "ph_1", caption: "x" }, { id: "ph_gone", caption: "" }] } })
    const v = previewView(d, { ph_1: "blob:1" })
    expect(v.recipientName).toBe("Your favourite person")
    expect(v.moments.photos).toEqual([{ url: "blob:1", caption: "x" }])
  })

  it("keeps celebration away from sad occasions", () => {
    expect(celebrationAllowed("birthday")).toBe(true)
    expect(celebrationAllowed("sympathy")).toBe(false)
    expect(defaultDesignFor("birthday").theme).toBe("celebration")
    expect(defaultDesignFor("sympathy")).toMatchObject({ theme: "table", petals: false })
  })

  it("lets the recipient page frame every music service the parser accepts", () => {
    const worker = readFileSync(resolve(process.cwd(), "worker/index.ts"), "utf8")
    const frameSrc = worker.match(/"frame-src ([^"]+)"/)?.[1] ?? ""
    for (const origin of SONG_FRAME_ORIGINS) expect(frameSrc.split(" ")).toContain(origin)
  })

  it("lets the HEIC decoder start its worker", () => {
    // heic-to/csp decodes iPhone photos in a worker created from a blob: URL (src/lib/images.ts).
    const worker = readFileSync(resolve(process.cwd(), "worker/index.ts"), "utf8")
    expect(worker.match(/"worker-src ([^"]+)"/)?.[1].split(" ")).toContain("blob:")
  })
})
