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
import { createAppServerKit, createSessionRouteHandler } from '@circle-fin/app-kit/server'

const PORT = 3001

// ── OpenPay Partner credentials ──────────────────────────────────────────────
const OP_CLIENT_ID     = process.env.OPENPAY_CLIENT_ID ?? ''
const OP_CLIENT_SECRET = process.env.OPENPAY_CLIENT_SECRET ?? ''
const OP_API_KEY       = process.env.OPENPAY_API_KEY ?? ''
const OP_REDIRECT_URI  = process.env.OPENPAY_REDIRECT_URI ?? 'https://openpayarc.netlify.app/auth/openpay/callback'
// OAuth authorize UI lives at openpy.space; all API calls go to the Supabase edge function
const OP_AUTH_BASE     = 'https://openpy.space'
const OP_API_BASE      = 'https://araojncyittkahvvpdrn.supabase.co/functions/v1/partner-transfer-api'

const apiKey        = process.env.CIRCLE_API_KEY ?? ''
// Onramp uses the Circle API key (same key, not a separate KIT_KEY)
// ONRAMP_KIT_KEY is kept as a fallback alias for backward compatibility
// Onramp API key: prefer ONRAMP_KIT_KEY (App Kit key) over CIRCLE_API_KEY (dev wallets key)
const ONRAMP_API_KEY = process.env.ONRAMP_KIT_KEY ?? process.env.CIRCLE_API_KEY ?? ''


// App Kit server — onramp sessions via createAppServerKit
// Uses CIRCLE_API_KEY (standard Circle API key from console.circle.com/api-keys)
// Falls back to ONRAMP_KIT_KEY if CIRCLE_API_KEY not set
const onrampApiKey  = ONRAMP_API_KEY
const appServer     = onrampApiKey
  ? createAppServerKit({
      onramp: {
        apiKey: onrampApiKey,
        referrerDomain: 'openpayarc.netlify.app',
      },
    })
  : null
const sessionHandler = appServer ? createSessionRouteHandler(appServer.onramp) : null
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
  // Mints a short-lived Arc Onramp session using @circle-fin/app-kit/server.
  // CIRCLE_API_KEY (or ONRAMP_KIT_KEY as fallback) stays server-side only.
  if (req.method === 'POST' && url.pathname === '/onramp/sessions') {
    if (!sessionHandler) {
      return json({ error: { name: 'server_misconfigured', message: 'CIRCLE_API_KEY not set in .env — add your Circle API key from console.circle.com/api-keys to enable Arc Onramp.' } }, 503)
    }
    try {
      // Body was already consumed by req.text() above — reconstruct a fresh Request
      // so the SDK can read it. Mirror all original headers.
      const freshReq = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: rawBody,
      })
      return await sessionHandler(freshReq)
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
  // Returns the OAuth2 authorization URL — authorize UI is at openpy.space/connect
  if (req.method === 'GET' && url.pathname === '/openpay/auth-url') {
    if (!OP_CLIENT_ID) return err('OPENPAY_CLIENT_ID not set', 503)
    const state = crypto.randomUUID()
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OP_CLIENT_ID,
      redirect_uri: OP_REDIRECT_URI,
      scope: 'profile balance email',
      state,
    })
    // Authorize URL is at openpy.space/connect (not the API base)
    const authUrl = `${OP_AUTH_BASE}/connect?${params.toString()}`
    return json({ authUrl, state })
  }

  // ── POST /openpay/token ──────────────────────────────────────────────────
  // Exchanges auth code for access token via Supabase edge function
  if (req.method === 'POST' && url.pathname === '/openpay/token') {
    if (!OP_CLIENT_ID) return err('OPENPAY_CLIENT_ID not set', 503)
    const { code } = getBody<{ code?: string }>()
    if (!code) return err('code required')
    try {
      const res = await fetch(`${OP_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: OP_CLIENT_ID,
          client_secret: OP_CLIENT_SECRET,
          code,
          redirect_uri: OP_REDIRECT_URI,
        }),
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) }
      catch { return json({ access_token: null, raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── GET /openpay/me ──────────────────────────────────────────────────────
  // Returns connected OpenPay user profile (name, username, avatar, account_number)
  if (req.method === 'GET' && url.pathname === '/openpay/me') {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    try {
      const res = await fetch(`${OP_API_BASE}/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── GET /openpay/wallet ──────────────────────────────────────────────────
  // Returns connected OpenPay wallet (OUSD balance + address)
  // /user/me with scope=balance already returns balance; this route hits it again for refresh
  if (req.method === 'GET' && url.pathname === '/openpay/wallet') {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    try {
      const res = await fetch(`${OP_API_BASE}/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── POST /openpay/transfer ───────────────────────────────────────────────
  // Send OUSD to another OpenPay account number
  if (req.method === 'POST' && url.pathname === '/openpay/transfer') {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    const body = getBody<{ recipient_account?: string; amount?: number; currency?: string; memo?: string }>()
    if (!body.recipient_account) return err('recipient_account required')
    if (!body.amount || body.amount <= 0) return err('amount required')
    try {
      const res = await fetch(`${OP_API_BASE}/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_account: body.recipient_account,
          amount: body.amount,
          currency: body.currency ?? 'OUSD',
          memo: body.memo ?? '',
        }),
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── GET /openpay/transactions ────────────────────────────────────────────
  // Returns OUSD transaction history for the connected account
  if (req.method === 'GET' && url.pathname === '/openpay/transactions') {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return err('Authorization header required', 401)
    try {
      const res = await fetch(`${OP_API_BASE}/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  // ── GET /openpay/resolve/:account ───────────────────────────────────────
  // Resolve an OpenPay account number / username to profile (for scan-to-pay)
  const resolveMatch = url.pathname.match(/^\/openpay\/resolve\/(.+)$/)
  if (req.method === 'GET' && resolveMatch) {
    const account = resolveMatch[1]
    try {
      const res = await fetch(`${OP_API_BASE}/resolve/${encodeURIComponent(account)}`)
      const text = await res.text()
      try { return json(JSON.parse(text), res.status) } catch { return json({ raw: text }, res.status) }
    } catch (e) { return err(String(e), 500) }
  }

  return err('Not found', 404)
}

console.log(`OpenPay Arc wallet server listening on http://localhost:${PORT}`)

Bun.serve({ port: PORT, fetch: handle })
