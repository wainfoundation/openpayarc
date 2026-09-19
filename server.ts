/**
 * OpenPay Arc — wallet backend (Bun native HTTP server)
 * Proxied from Vite at /api/wallet/* → routes below (without /api/wallet prefix)
 *
 * Routes:
 *  POST /device-token   → createDeviceTokenForSocialLogin
 *  POST /initialize     → createUserPinWithWallets (or detect existing user)
 *  POST /wallets        → listWallets
 */

import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'

const PORT = 3001
const apiKey = process.env.CIRCLE_API_KEY ?? ''

// Lazy client — returns an error response if key is missing
function getClient() {
  if (!apiKey) return null
  return initiateUserControlledWalletsClient({ apiKey })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status)
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') return err('Method not allowed', 405)

  const client = getClient()
  if (!client) return err('CIRCLE_API_KEY not set in .env', 503)

  let body: Record<string, string> = {}
  try { body = await req.json() as Record<string, string> } catch { /* empty body */ }

  // ── POST /device-token ───────────────────────────────────────────────────
  if (url.pathname === '/device-token') {
    const { deviceId } = body
    if (!deviceId) return err('deviceId required')
    const res = await client.createDeviceTokenForSocialLogin({ deviceId })
    return json(res.data)
  }

  // ── POST /initialize ─────────────────────────────────────────────────────
  if (url.pathname === '/initialize') {
    const { userToken } = body
    if (!userToken) return err('userToken required')
    try {
      const res = await client.createUserPinWithWallets({
        userToken,
        blockchains: [Blockchain.ArcTestnet],
        accountType: 'SCA',
      })
      return json(res.data)
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { code?: number } } })?.response?.data?.code
      if (code === 155106) return json({ code: 155106 }) // user already exists
      return err((e as Error).message ?? 'Initialization failed', 500)
    }
  }

  // ── POST /wallets ────────────────────────────────────────────────────────
  if (url.pathname === '/wallets') {
    const { userToken } = body
    if (!userToken) return err('userToken required')
    const res = await client.listWallets({ userToken })
    return json(res.data)
  }

  return err('Not found', 404)
}

console.log(`OpenPay Arc wallet server listening on http://localhost:${PORT}`)

Bun.serve({ port: PORT, fetch: handle })
