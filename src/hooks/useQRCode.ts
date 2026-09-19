/**
 * useQRCode — renders a QR code onto a canvas using the `qrcode` npm library.
 * Returns a ref to attach to a <canvas> element and an error string if generation fails.
 * Uses toCanvas() which is fully browser-safe (no SVG/DOM serialization).
 */
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

export function useQRCode(data: string, size = 200): {
  canvasRef: React.RefObject<HTMLCanvasElement>
  ready: boolean
  error: string | null
} {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    let cancelled = false

    QRCode.toCanvas(canvas, data, {
      width: size,
      margin: 2,
      color: { dark: '#1d2f50', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'QR generation failed')
      })

    return () => { cancelled = true }
  }, [data, size])

  return { canvasRef, ready, error }
}
