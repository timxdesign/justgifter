import { useEffect } from "react"

interface Meta {
  title: string
  description?: string
  /** Private routes (gift links, checkout, accounts) must never be indexed (§14 public rendering). */
  noindex?: boolean
  image?: string
  canonical?: string
}

const SITE = "JustGifter"

function setMeta(attr: "name" | "property", key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!content) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement("meta")
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

/**
 * Client-side metadata for navigation within the SPA. The Cloudflare Worker renders the same
 * metadata server-side for first loads and link previews (worker/index.ts).
 */
export function useDocumentMeta({ title, description, noindex, image, canonical }: Meta) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : `${SITE} — Thoughtful gifts, delivered with a moment`
    if (description) setMeta("name", "description", description)
    setMeta("property", "og:title", title || SITE)
    if (description) setMeta("property", "og:description", description)
    setMeta("property", "og:image", image ? new URL(image, location.origin).toString() : null)
    setMeta("name", "robots", noindex ? "noindex, nofollow" : null)
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (canonical) {
      if (!link) {
        link = document.createElement("link")
        link.rel = "canonical"
        document.head.appendChild(link)
      }
      link.href = new URL(canonical, location.origin).toString()
    } else link?.remove()
  }, [title, description, noindex, image, canonical])
}
