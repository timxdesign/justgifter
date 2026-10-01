import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import type { GiftRevealView } from "@/api"
import { Img } from "@/components/common"
import { DeliveryIcon, CheckCircleIcon, ClockCircleIcon, BoxIcon } from "@/components/icons"
import { formatDate, formatWindow } from "@/lib/format"
import { toDateOnly, LAUNCH_TIMEZONE } from "@domain/index.ts"

const ease = [0.2, 0, 0, 1] as const

/** The opened gift: item, message and a fulfilment status kept separate from the reveal (GFT 09). */
export function RevealContent({ view, children }: { view: GiftRevealView; children?: ReactNode }) {
  const reduce = useReducedMotion()
  const [img, setImg] = useState(0)
  const enter = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.1 * i, ease } })
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-4 sm:pt-10">
      <motion.div {...enter(0)} className="bg-card shadow-float overflow-hidden rounded-[2rem]">
        <div className="grid sm:grid-cols-[1.05fr_1fr]">
          <div className="relative aspect-[4/5] sm:aspect-auto sm:min-h-[26rem]">
            <Img src={view.item.images[img] ?? view.item.image} alt={view.item.title} eager className="absolute inset-0 size-full" sizes="(min-width: 640px) 50vw, 100vw" />
            {view.item.images.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {view.item.images.map((_, i) => (
                  <button key={i} type="button" aria-label={`Photo ${i + 1}`} aria-pressed={i === img} onClick={() => setImg(i)} className={cn("h-1.5 rounded-full bg-white/90 transition-[width,opacity]", i === img ? "w-6" : "w-1.5 opacity-60")} />
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <motion.p {...enter(1)} className="eyebrow text-brand-text">
              {view.occasionTitle ? `For ${view.occasionTitle}` : "Your gift"}
            </motion.p>
            <motion.div {...enter(2)}>
              <h2 className="font-display text-3xl leading-tight font-medium">{view.item.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {view.item.quantity > 1 ? `${view.item.quantity} × ` : ""}
                {view.item.variantName} · from {view.item.vendorName}
              </p>
            </motion.div>
            {view.message && (
              <motion.blockquote {...enter(3)} className="paper-grain bg-muted/70 relative rounded-2xl p-5">
                <span aria-hidden="true" className="font-display text-brand absolute -top-3 left-4 text-5xl leading-none">“</span>
                <p className="font-display text-xl leading-snug whitespace-pre-line italic">{view.message}</p>
                <footer className="text-muted-foreground mt-3 text-sm">— {view.anonymous ? "Someone who's thinking of you" : view.senderDisplayName}</footer>
              </motion.blockquote>
            )}
            {view.item.personalisationText && (
              <motion.p {...enter(4)} className="text-muted-foreground text-sm">
                Personalised with: <span className="text-foreground italic">“{view.item.personalisationText}”</span>
              </motion.p>
            )}
          </div>
        </div>
      </motion.div>
      <motion.div {...enter(4)}>
        <FulfilmentCard view={view} />
      </motion.div>
      {children}
    </div>
  )
}

function FulfilmentCard({ view }: { view: GiftRevealView }) {
  const f = view.fulfilment
  const awaitingAddress = view.claim.status === "pending" || view.claim.status === "needs_sender_approval"
  const Icon = f.delivered ? CheckCircleIcon : f.dispatched ? DeliveryIcon : awaitingAddress ? ClockCircleIcon : BoxIcon
  const today = toDateOnly(new Date(), LAUNCH_TIMEZONE)
  return (
    <section aria-label="Delivery status" className="bg-card shadow-border flex items-center gap-4 rounded-2xl p-5">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-full", f.delivered ? "bg-success-soft text-success" : f.dispatched ? "bg-info-soft text-info" : "bg-muted text-muted-foreground")}>
        <Icon className="size-6" />
      </span>
      <div className="flex-1">
        <p className="font-medium">{awaitingAddress ? "Waiting for your address" : f.label}</p>
        <p className="text-muted-foreground text-sm">
          {awaitingAddress
            ? "Add where you'd like it delivered and the vendor will start preparing it."
            : f.window
              ? `${toDateOnly(new Date(f.window.start), LAUNCH_TIMEZONE) === today ? "Today" : formatDate(toDateOnly(new Date(f.window.start), LAUNCH_TIMEZONE))}, ${formatWindow(f.window.start, f.window.end)}${f.window.kind === "confirmed" ? "" : " (estimated)"}`
              : f.delivered
                ? "Enjoy it!"
                : "We'll show a delivery window once the vendor confirms."}
        </p>
      </div>
    </section>
  )
}
