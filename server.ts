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

// ── OpenPay Partner credentials ──────────────────────────────────────────────
const OP_CLIENT_ID     = process.env.OPENPAY_CLIENT_ID ?? ''
const OP_CLIENT_SECRET = process.env.OPENPAY_CLIENT_SECRET ?? ''
const OP_API_KEY       = process.env.OPENPAY_API_KEY ?? ''
const OP_REDIRECT_URI  = process.env.OPENPAY_REDIRECT_URI ?? 'https://openpayarc.netlify.app/auth/openpay/callback'
const OP_BASE          = 'https://openpy.space'

const apiKey        = process.env.CIRCLE_API_KEY ?? ''
const KIT_KEY       = process.env.ONRAMP_KIT_KEY ?? ''
const ONRAMP_API    = 'https://api.circle.com/v1/w3s/onramp'
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

  // ── POST /onramp/sessions ────────────────────────────────────────────────
  // Mints a short-lived Arc Onramp session. Kit Key stays server-side only.
  if (req.method === 'POST' && url.pathname === '/onramp/sessions') {
    if (!KIT_KEY) {
      return json({ error: { name: 'server_misconfigured', message: 'ONRAMP_KIT_KEY not set in .env — add your Circle Kit Key to enable Arc Onramp.' } }, 503)
    }
    const body = getBody<{ userId?: string; destinationAddress?: string; amount?: string; currency?: string; email?: string }>()
    if (!body.destinationAddress) return err('destinationAddress required')
    try {
      const res = await fetch(`${ONRAMP_API}/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KIT_KEY}`,
          'Content-Type': 'application/json',
          'X-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          userId: body.userId ?? crypto.randomUUID(),
          destinationAddress: body.destinationAddress,
          ...(body.amount   ? { amount: body.amount }     : {}),
          ...(body.currency ? { currency: body.currency } : {}),
          ...(body.email    ? { email: body.email }       : {}),
        }),
      })
      const data = await res.json()
      return json(data, res.status)
    } catch (e) { return err(String(e), 500) }
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

  // ── GET /openpay/auth-url ────────────────────────────────────────────────
  // Returns the OAuth2 authorization URL for the partner connect flow
  if (req.method === 'GET' && url.pathname === '/openpay/auth-url') {
    if (!OP_CLIENT_ID) return err('OPENPAY_CLIENT_ID not set', 503)
    const state = crypto.randomUUID()
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OP_CLIENT_ID,
      redirect_uri: OP_REDIRECT_URI,
      scope: 'openid profile wallet:read payments:read',
      state,
    })
    const authUrl = `${OP_BASE}/oauth/authorize?${params.toString()}`
    return json({ authUrl, state })
  }

  // ── POST /openpay/token ──────────────────────────────────────────────────
  // Exchanges auth code for access token
  if (req.method === 'POST' && url.pathname === '/openpay/token') {
    if (!OP_CLIENT_ID) return err('OPENPAY_CLIENT_ID not set', 503)
    const { code } = getBody<{ code?: string }>()
    if (!code) return err('code required')
    try {
      const res = await fetch(`${OP_BASE}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': OP_API_KEY,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: OP_CLIENT_ID,
          client_secret: OP_CLIENT_SECRET,
          code,
          redirect_uri: OP_REDIRECT_URI,
        }),
      })
      const text = await res.text()
      try {
        const data = JSON.parse(text)
        return json(data, res.status)
      } catch {
        return json({ access_token: null, raw: text }, res.status)
      }
    } catch (e) { return err(String(e), 500) }
  }

  // ── GET /openpay/me ──────────────────────────────────────────────────────
  // Returns connected OpenPay user profile
  if (req.method === 'GET' && url.pathname === '/openpay/me') {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    try {
      const res = await fetch(`${OP_BASE}/api/v1/me`, {
        headers: { Authorization: `Bearer ${token}`, 'X-API-Key': OP_API_KEY },
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── GET /openpay/wallet ──────────────────────────────────────────────────
  // Returns connected OpenPay wallet info
  if (req.method === 'GET' && url.pathname === '/openpay/wallet') {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    try {
      const res = await fetch(`${OP_BASE}/api/v1/wallet`, {
        headers: { Authorization: `Bearer ${token}`, 'X-API-Key': OP_API_KEY },
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── POST /openpay/payment ────────────────────────────────────────────────
  // Initiates a payment via OpenPay partner API
  if (req.method === 'POST' && url.pathname === '/openpay/payment') {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    const body = getBody<{ amount?: string; currency?: string; recipient?: string; memo?: string }>()
    try {
      const res = await fetch(`${OP_BASE}/api/v1/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-API-Key': OP_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  return err('Not found', 404)
}

console.log(`OpenPay Arc wallet server listening on http://localhost:${PORT}`)

Bun.serve({ port: PORT, fetch: handle })
