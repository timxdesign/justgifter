import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/common"
import { DownloadIcon, ShareIcon } from "@/components/icons"

/** Share link + downloadable QR code (EVT 05, STF 01). Works without any messaging API. */
export function ShareCard({ url, title, filename }: { url: string; title: string; filename: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 640, color: { dark: "#1e1311", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null))
  }, [url])
  const canShare = typeof navigator !== "undefined" && "share" in navigator
  return (
    <div className="bg-card shadow-border flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center">
      {qr ? <img src={qr} alt={`QR code linking to ${title}`} className="size-32 shrink-0 rounded-xl bg-white p-1.5" /> : <div className="bg-muted size-32 shrink-0 rounded-xl" />}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="bg-muted truncate rounded-lg px-3 py-2 font-mono text-sm" title={url}>{url}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={url} />
          {qr && (
            <Button variant="outline" asChild>
              <a href={qr} download={`${filename}-qr.png`}>
                <DownloadIcon data-icon="inline-start" />
                Download QR
              </a>
            </Button>
          )}
          {canShare && (
            <Button variant="outline" onClick={() => navigator.share({ title, url }).catch(() => undefined)}>
              <ShareIcon data-icon="inline-start" />
              Share
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          </Button>
        </div>
      </div>
    </div>
  )
}
