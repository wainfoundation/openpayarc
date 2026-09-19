/**
 * useQRScanner — wraps @zxing/browser's BrowserMultiFormatReader for live camera scanning.
 * Gracefully handles permission denials and sandboxed iframe environments.
 */
import { useEffect, useRef, useState, useCallback } from 'react'

export type ScannerState = 'idle' | 'requesting' | 'scanning' | 'denied' | 'error' | 'unsupported'

interface UseQRScannerResult {
  state: ScannerState
  errorMsg: string | null
  videoRef: React.RefObject<HTMLVideoElement>
  start: () => void
  stop: () => void
}

interface ZxingReader {
  decodeFromVideoDevice(
    deviceId: string | undefined,
    el: HTMLVideoElement,
    callback: (result: { getText(): string } | null, err: unknown) => void
  ): Promise<void>
  reset(): void
}

export function useQRScanner(onResult: (text: string) => void): UseQRScannerResult {
  const [state, setState] = useState<ScannerState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<ZxingReader | null>(null)
  const activeRef = useRef(false)

  const stop = useCallback(() => {
    activeRef.current = false
    if (readerRef.current) {
      try { readerRef.current.reset() } catch { /* ignore */ }
      readerRef.current = null
    }
    setState('idle')
  }, [])

  const start = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    setState('requesting')
    setErrorMsg(null)

    import('@zxing/browser').then(zxing => {
      if (!activeRef.current) return

      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported')
        setErrorMsg('Camera not available in this environment.')
        return
      }

      const reader = new zxing.BrowserMultiFormatReader() as unknown as ZxingReader
      readerRef.current = reader
      setState('scanning')

      reader
        .decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
          if (!activeRef.current) return
          if (result) {
            onResult(result.getText())
            stop()
            return
          }
          // Ignore NotFoundException (no QR in frame yet) — only log real errors
          if (err) {
            const msg = err instanceof Error ? err.message : 'Unknown scan error'
            if (!msg.includes('NotFoundException') && !msg.includes('No MultiFormat Readers')) {
              console.warn('[QRScanner]', msg)
            }
          }
        })
        .catch((err: unknown) => {
          if (!activeRef.current) return
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')) {
            setState('denied')
            setErrorMsg('Camera permission denied. Please allow camera access and try again.')
          } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no camera')) {
            setState('unsupported')
            setErrorMsg('No camera found on this device.')
          } else {
            setState('error')
            setErrorMsg(msg)
          }
        })
    }).catch(() => {
      setState('error')
      setErrorMsg('Scanner library failed to load.')
    })
  }, [onResult, stop])

  useEffect(() => () => { stop() }, [stop])

  return { state, errorMsg, videoRef, start, stop }
}
