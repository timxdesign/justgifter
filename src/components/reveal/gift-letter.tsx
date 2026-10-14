import { useMemo } from "react"
import { EMPTY_MOMENTS, type LetterDesign } from "@domain/index.ts"
import type { LetterView } from "@/api"
import { LetterExperience } from "@/components/letter/experience"

/**
 * A gift's message shown as a designed letter: the same envelope, flower table and paper as a
 * letter sent on its own. Loaded lazily by RevealContent so plain-message gifts never pay for it.
 */
export default function GiftLetter({ message, design, recipientName, from }: { message: string; design: LetterDesign; recipientName: string; from: string }) {
  const letter = useMemo<LetterView>(
    () => ({
      recipientName,
      recipientFirstName: recipientName.split(" ")[0],
      senderDisplayName: from,
      body: message,
      occasion: null,
      sentAt: new Date().toISOString(),
      design,
      moments: { ...EMPTY_MOMENTS, photos: [] },
      sealed: false,
      opensAt: new Date().toISOString(),
    }),
    [message, design, recipientName, from],
  )
  return (
    <section data-gift-letter aria-label="Your letter" className="relative h-[40rem] overflow-hidden rounded-[2rem] shadow-[var(--shadow-float)] @[40rem]:h-[44rem]">
      <LetterExperience letter={letter} mode="embedded" />
    </section>
  )
}
