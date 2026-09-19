/**
 * OpenPay Arc — wallet backend (Bun native HTTP server)
 * Proxied from Vite at /api/wallet/* → routes below (without /api/wallet prefix)
 *
 * Circle wallet routes:
 *  POST /device-token   → createDeviceTokenForSocialLogin
 *  POST /initialize     → createUserPinWithWallets (or detect existing user)
 *  POST /wallets        → listWallets
 *
 * PayPal proxy routes (Vite proxies /api/paypal/* → here without /api/paypal prefix):
 *  GET  /client-token   → returns sandbox client token for PayPal JS SDK
 *  POST /order          → creates a PayPal order, returns { id }
 *  POST /order/:id/capture → captures a PayPal order
 */

import { initiateUserControlledWalletsClient, Blockchain } from '@circle-fin/user-controlled-wallets'

const PORT = 3001
const apiKey        = process.env.CIRCLE_API_KEY ?? ''
const PAYPAL_ID     = process.env.PAYPAL_CLIENT_ID ?? ''
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? ''
const PAYPAL_BASE   = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

// ── PayPal helpers ───────────────────────────────────────────────────────────

async function paypalAccessToken(): Promise<string> {
  const creds = Buffer.from(`${PAYPAL_ID}:${PAYPAL_SECRET}`).toString('base64')
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json() as { access_token?: string }
  if (!data.access_token) throw new Error('PayPal auth failed')
  return data.access_token
}

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

  // PayPal GET routes (don't require Circle client)
  if (req.method === 'GET') {
    // fall through to PayPal route handlers below
  } else if (req.method !== 'POST') {
    return err('Method not allowed', 405)
  }

  // Parse body ONCE — store for all routes that need it
  let rawBody = ''
  if (req.method === 'POST') {
    try { rawBody = await req.text() } catch { /* empty */ }
  }
  function getBody<T = Record<string, string>>(): T {
    try { return JSON.parse(rawBody) as T } catch { return {} as T }
  }

  // ── POST /device-token ───────────────────────────────────────────────────
  if (url.pathname === '/device-token') {
    const client = getClient()
    if (!client) return err('CIRCLE_API_KEY not set in .env', 503)
    const { deviceId } = getBody()
    if (!deviceId) return err('deviceId required')
    const res = await client.createDeviceTokenForSocialLogin({ deviceId })
    return json(res.data)
  }

  // ── POST /initialize ─────────────────────────────────────────────────────
  if (url.pathname === '/initialize') {
    const client = getClient()
    if (!client) return err('CIRCLE_API_KEY not set in .env', 503)
    const { userToken } = getBody()
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
    const client = getClient()
    if (!client) return err('CIRCLE_API_KEY not set in .env', 503)
    const { userToken } = getBody()
    if (!userToken) return err('userToken required')
    const res = await client.listWallets({ userToken })
    return json(res.data)
  }

  // ── GET /paypal/client-token ─────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/paypal/client-token') {
    // Return public client ID only — full token generation requires outbound API access
    return json({ clientId: PAYPAL_ID || '' })
  }

  // ── POST /paypal/order ───────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/paypal/order') {
    if (!PAYPAL_ID) return err('PAYPAL_CLIENT_ID not set', 503)
    const orderBody = getBody<{ amount?: string; currency?: string; description?: string; recipientAddress?: string }>()
    const amount   = orderBody.amount ?? '1.00'
    const currency = orderBody.currency ?? 'USD'
    const desc     = orderBody.description ?? 'OpenPay Arc — Buy USDC'
    try {
      const access = await paypalAccessToken()
      const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: { currency_code: currency, value: parseFloat(amount).toFixed(2) },
            description: desc,
            custom_id: orderBody.recipientAddress ?? '',
          }],
          application_context: { brand_name: 'OpenPay Arc', user_action: 'PAY_NOW' },
        }),
      })
      const data = await res.json()
      return json(data, res.status)
    } catch (e) { return err(String(e), 500) }
  }

  // ── POST /paypal/order/:id/capture ───────────────────────────────────────
  const captureMatch = url.pathname.match(/^\/paypal\/order\/([^/]+)\/capture$/)
  if (req.method === 'POST' && captureMatch) {
    const orderId = captureMatch[1]
    if (!PAYPAL_ID) return err('PAYPAL_CLIENT_ID not set', 503)
    try {
      const access = await paypalAccessToken()
      const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
        body: '{}',
      })
      const data = await res.json()
      return json(data, res.status)
    } catch (e) { return err(String(e), 500) }
  }

  return err('Not found', 404)
}

console.log(`OpenPay Arc wallet server listening on http://localhost:${PORT}`)

Bun.serve({ port: PORT, fetch: handle })
