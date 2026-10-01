/**
 * JustGifter edge Worker (PRD §14 "Public rendering and search visibility").
 *
 * - Public routes (stores, products, deliberately public occasion pages) get server-rendered
 *   <title>, description, canonical, Open Graph tags and an indexable HTML snapshot, so link
 *   previews and crawlers don't depend on client JavaScript.
 * - Private routes (gift links, checkout, accounts, previews) are never cached, never indexed,
 *   and send no referrer, so reveal tokens can't leak to third parties.
 * - It contains no commerce logic: data comes from Supabase's public, RLS-protected endpoints.
 */

interface Meta {
  title: string
  description: string
  image?: string
  canonical?: string
  noindex?: boolean
  body?: string
  jsonLd?: unknown
}

const PRIVATE = [/^\/g\//, /^\/preview\//, /^\/checkout/, /^\/account/, /^\/orders/, /^\/pay\//, /^\/vendor/, /^\/admin/, /^\/events/, /^\/mfa/, /^\/signin/, /^\/cart/]

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
}

function csp(env: Env) {
  const supabase = env.SUPABASE_URL || ""
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")}`,
    "frame-src https://challenges.cloudflare.com https://checkout.paystack.com",
    "form-action 'self' https://checkout.paystack.com",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`

async function rest<T>(env: Env, path: string): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }, cf: { cacheTtl: 60 } } as RequestInit)
  return res.ok ? ((await res.json()) as T) : null
}

async function api<T>(env: Env, method: string, args: Record<string, unknown>): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/api`, { method: "POST", headers: { "Content-Type": "application/json", apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }, body: JSON.stringify({ method, args }) })
  if (!res.ok) return null
  return ((await res.json()) as { data: T }).data
}

const slugOk = (s: string) => /^[a-z0-9_-]{1,80}$/i.test(s)

async function metaFor(url: URL, env: Env): Promise<Meta | null> {
  const site = env.PUBLIC_SITE_URL || url.origin
  const store = url.pathname.match(/^\/stores\/([^/]+)\/?$/)
  const product = url.pathname.match(/^\/products\/([^/]+)\/?$/) ?? url.pathname.match(/^\/stores\/[^/]+\/products\/([^/]+)\/?$/)
  const event = url.pathname.match(/^\/e\/([^/]+)\/?$/)

  if (store && slugOk(store[1])) {
    const rows = await rest<{ slug: string; headline: string; intro: string; cover_image: string; vendors: { name: string } }[]>(env, `storefronts?slug=eq.${store[1]}&select=slug,headline,intro,cover_image,vendors(name)`)
    const s = rows?.[0]
    if (!s) return null
    return { title: `${s.vendors.name} · JustGifter`, description: s.headline, image: s.cover_image, canonical: `${site}/stores/${s.slug}`, body: `<main><h1>${esc(s.vendors.name)}</h1><p>${esc(s.headline)}</p><p>${esc(s.intro)}</p></main>`, jsonLd: { "@context": "https://schema.org", "@type": "Store", name: s.vendors.name, description: s.headline, url: `${site}/stores/${s.slug}` } }
  }
  if (product && slugOk(product[1])) {
    const rows = await rest<{ slug: string; title: string; summary: string; description: string; images: string[]; vendors: { name: string }; variants: { price: number; stock: number }[] }[]>(env, `products?slug=eq.${product[1]}&select=slug,title,summary,description,images,vendors(name),variants(price,stock)`)
    const p = rows?.[0]
    if (!p) return null
    const from = Math.min(...p.variants.map((v) => v.price))
    const inStock = p.variants.some((v) => v.stock > 0)
    return {
      title: `${p.title} · ${p.vendors.name} · JustGifter`, description: `${p.summary} From ${naira(from)}.`, image: p.images[0], canonical: `${site}/products/${p.slug}`,
      body: `<main><h1>${esc(p.title)}</h1><p>${esc(p.summary)}</p><p>From ${naira(from)} · by ${esc(p.vendors.name)}</p><p>${esc(p.description)}</p></main>`,
      jsonLd: { "@context": "https://schema.org", "@type": "Product", name: p.title, description: p.summary, image: p.images.map((i) => new URL(i, site).toString()), brand: p.vendors.name, offers: { "@type": "Offer", priceCurrency: "NGN", price: from / 100, availability: `https://schema.org/${inStock ? "InStock" : "OutOfStock"}` } },
    }
  }
  if (event && slugOk(event[1])) {
    const res = await api<{ kind: string; view?: { event: { visibility: string; content: { title: string; hostDisplayName: string; story: string; coverImage: string } } } }>(env, "getPublicEvent", { slug: event[1] })
    // Private or unavailable pages expose nothing in metadata (§14, AC 08).
    if (!res || res.kind !== "found" || !res.view) return { title: "A celebration on JustGifter", description: "You've been invited to a celebration.", noindex: true }
    const e = res.view.event
    return { title: `${e.content.title} · JustGifter`, description: `Celebrate with ${e.content.hostDisplayName}.`, image: e.content.coverImage, canonical: `${site}/e/${event[1]}`, noindex: e.visibility !== "public", body: `<main><h1>${esc(e.content.title)}</h1><p>Hosted by ${esc(e.content.hostDisplayName)}</p></main>` }
  }
  return null
}

function inject(html: string, meta: Meta, origin: string) {
  const image = meta.image ? new URL(meta.image.replace(/\.webp$/, "@2x.webp"), origin).toString() : null
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : "",
    meta.canonical ? `<link rel="canonical" href="${esc(meta.canonical)}" />` : "",
    meta.noindex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ].join("\n    ")
  return html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*>/, "")
    .replace("<!--app-meta-->", tags)
    .replace("<!--app-html-->", meta.body ?? "")
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/robots.txt") {
      return new Response(`User-agent: *\nDisallow: /g/\nDisallow: /preview/\nDisallow: /checkout\nDisallow: /account\nDisallow: /orders\nDisallow: /vendor\nDisallow: /admin\nDisallow: /events\nAllow: /\nSitemap: ${env.PUBLIC_SITE_URL || url.origin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=3600" } })
    }
    if (url.pathname === "/sitemap.xml") {
      const site = env.PUBLIC_SITE_URL || url.origin
      const [stores, products] = await Promise.all([rest<{ slug: string }[]>(env, "storefronts?select=slug"), rest<{ slug: string }[]>(env, "products?select=slug")])
      const urls = ["/", "/shop", "/assistant", "/occasion-pages", "/vendors", "/sell", "/help", ...(stores ?? []).map((s) => `/stores/${s.slug}`), ...(products ?? []).map((p) => `/products/${p.slug}`)]
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(site + u)}</loc></url>`).join("")}</urlset>`
      return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } })
    }

    const isPrivate = PRIVATE.some((r) => r.test(url.pathname))
    const assetRes = await env.ASSETS.fetch(request)
    const isHtml = (assetRes.headers.get("content-type") ?? "").includes("text/html")
    if (!isHtml) return assetRes

    let html = await assetRes.text()
    const headers = new Headers(assetRes.headers)
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
    headers.set("Content-Security-Policy", csp(env))

    if (isPrivate) {
      // Gift links and accounts: no caching anywhere, no indexing, no referrer leakage (SEC 05).
      headers.set("Cache-Control", "no-store, private")
      headers.set("X-Robots-Tag", "noindex, nofollow")
      headers.set("Referrer-Policy", "no-referrer")
      html = html.replace("<!--app-meta-->", '<meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="no-referrer" />')
      return new Response(html, { status: assetRes.status, headers })
    }

    const meta = await metaFor(url, env).catch(() => null)
    if (meta) {
      html = inject(html, meta, url.origin)
      // Unpublished events must become non-public immediately, so their HTML is never shared-cached.
      headers.set("Cache-Control", meta.noindex ? "no-store" : "public, max-age=60, s-maxage=300, stale-while-revalidate=600")
      if (meta.noindex) headers.set("X-Robots-Tag", "noindex")
    }
    return new Response(html, { status: assetRes.status, headers })
  },
} satisfies ExportedHandler<Env>
