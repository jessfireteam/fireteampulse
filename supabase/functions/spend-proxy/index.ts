/**
 * spend-proxy — the ONLY sanctioned read path into the FB Ads Supabase project.
 *
 * DEPLOYS TO ojqdhqbynccwgowbzhir ("FireTeam Facebook Ads Data"), NOT to this
 * repo's own project. It lives in this repo because every consumer's source
 * does. Deploy with:
 *   npx supabase functions deploy spend-proxy --project-ref ojqdhqbynccwgowbzhir
 * (config.toml carries verify_jwt = false for it — callers present JWTs issued
 * by the fireteam-pulse project, which this project's gateway cannot verify,
 * so verification happens in code below.)
 *
 * WHY THIS EXISTS. Until 2026-08-28 the FB Ads project was readable with its
 * anon key: `anon_read_*` policies on fb_ad_spend/fb_ad_creative, four tables
 * with RLS off entirely, and EXECUTE on the spend/fee RPCs granted to PUBLIC.
 * The anon key shipped in Pulse's public JS bundle, so per-client spend and
 * computed fees for the whole roster were readable by anyone. Those grants are
 * now revoked; this function reads with the service role key (auto-injected on
 * the hosting project) and gates every request itself.
 *
 * WHO CALLS IT.
 *   - Pulse's Movement page (browser)            — user JWT from fireteam-pulse
 *   - fibery-proxy (fireteam-pulse edge function) — forwards its caller's JWT
 *   - friday-flashback Netlify functions          — forward their caller's JWT
 *   - buddy-spend MCP connector on chappie        — x-machine-token header
 *
 * AUTH. Two ways in, checked in this order:
 *   1. `x-machine-token`: sha256(token) must equal MACHINE_TOKEN_SHA256.
 *      The plaintext lives only in the buddy-spend connector's env on chappie.
 *      Rotating it = generate a new token, update that env, redeploy this
 *      function with the new hash. Only the hash is committed.
 *   2. `Authorization: Bearer <jwt>`: validated against the fireteam-pulse
 *      project's auth API (the same project every FireTeam surface logs into),
 *      and the user's email must be @fireteam.is. Results are cached 60s per
 *      token because Movement fires ~40 parallel page requests per load.
 *
 * SURFACE. Deliberately narrow, read-only by construction:
 *   GET/HEAD /rest/<table>?<postgrest query>   table ∈ REST_TABLES
 *   POST     /rpc/<fn>    {json args}          fn    ∈ RPC_FUNCTIONS
 * The PostgREST query string is forwarded verbatim (these tables are exactly
 * the data authenticated staff may read, so arbitrary filters are fine), but
 * only GET reaches /rest, so no mutation can pass through. Adding a table or
 * function to the whitelists is a code change on purpose.
 */

const FB_ADS_URL = 'https://ojqdhqbynccwgowbzhir.supabase.co'

// fireteam-pulse — the auth project whose JWTs every caller presents.
const AUTH_PROJECT_URL = 'https://bmuqjchslhgnxgiugoyx.supabase.co'
// Its anon key: public by design (it ships in Pulse's bundle); needed only as
// the apikey header when asking that project's auth API "whose JWT is this?".
const AUTH_PROJECT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdXFqY2hzbGhnbnhnaXVnb3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NTY3NDgsImV4cCI6MjA5MjIzMjc0OH0.Br4q0Ep5t8qRRBnABgfU39Wy0ynEAtSphfImFL3LtSo'

const ALLOWED_EMAIL_DOMAIN = '@fireteam.is'

// sha256 hex of the machine token. Plaintext is NOT in this repo.
const MACHINE_TOKEN_SHA256 =
  '7c82805b8781faff3c0afbd4463cc753e3c3503d0d708032824ec1b776b2acc6'

const REST_TABLES = new Set([
  'fb_ad_spend',       // Pulse Movement, friday-flashback, buddy-spend
  'account_client',    // Pulse Movement (account_id → client map)
  'fb_ad_creative',    // Pulse Movement (thumbnail path lookup)
  'client_daily_spend' // buddy-spend (per-client-per-day aggregate view)
])
const RPC_FUNCTIONS = new Set([
  'get_monthly_spend_by_client',
  'get_monthly_fee_by_client',
  'get_weekly_spend_by_client',
  'top_ads',
])

// Request headers forwarded to PostgREST (pagination + exact counts need them).
const FORWARD_REQUEST_HEADERS = ['prefer', 'range', 'range-unit', 'accept']
// Response headers forwarded back (Content-Range carries the exact count).
const FORWARD_RESPONSE_HEADERS = ['content-type', 'content-range', 'content-profile']

const ALLOWED_ORIGINS = [
  'https://pulse.fireteam.is',
  'https://fireteam-pulse.netlify.app',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.netlify.app')
  ) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers':
      'authorization, x-machine-token, content-type, prefer, range, range-unit, accept',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'content-range, content-profile',
    'Access-Control-Allow-Credentials': 'true',
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// token → expiry timestamp of a positive auth check. Movement loads fire tens
// of parallel requests with the same JWT; one upstream auth call covers them.
const authCache = new Map<string, number>()
const AUTH_CACHE_TTL_MS = 60_000

async function verifyUserJwt(jwt: string): Promise<boolean> {
  const cached = authCache.get(jwt)
  if (cached && cached > Date.now()) return true

  const res = await fetch(`${AUTH_PROJECT_URL}/auth/v1/user`, {
    headers: { apikey: AUTH_PROJECT_ANON_KEY, Authorization: `Bearer ${jwt}` },
  })
  if (!res.ok) return false
  const user = await res.json()
  const email: string = (user?.email ?? '').toLowerCase()
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) return false

  if (authCache.size > 500) authCache.clear() // bound the cache; refill is one call
  authCache.set(jwt, Date.now() + AUTH_CACHE_TTL_MS)
  return true
}

async function isAuthorized(req: Request): Promise<boolean> {
  const machineToken = req.headers.get('x-machine-token')
  if (machineToken) {
    return (await sha256Hex(machineToken)) === MACHINE_TOKEN_SHA256
  }
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return false
  return await verifyUserJwt(auth.slice(7))
}

function deny(status: number, message: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  if (!(await isAuthorized(req))) return deny(401, 'Unauthorized', cors)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey) return deny(500, 'Service key unavailable', cors)

  const url = new URL(req.url)
  // Pathname arrives as /spend-proxy/rest/fb_ad_spend etc.; strip the prefix.
  const path = url.pathname.replace(/^\/spend-proxy/, '')
  const restMatch = path.match(/^\/rest\/([a-z_]+)$/)
  const rpcMatch = path.match(/^\/rpc\/([a-z_]+)$/)

  const serviceHeaders: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name)
    if (value) serviceHeaders[name] = value
  }

  let upstream: Response
  if (restMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const table = restMatch[1]
    if (!REST_TABLES.has(table)) return deny(404, `Unknown table: ${table}`, cors)
    upstream = await fetch(`${FB_ADS_URL}/rest/v1/${table}${url.search}`, {
      method: req.method,
      headers: serviceHeaders,
    })
  } else if (rpcMatch && req.method === 'POST') {
    const fn = rpcMatch[1]
    if (!RPC_FUNCTIONS.has(fn)) return deny(404, `Unknown function: ${fn}`, cors)
    upstream = await fetch(`${FB_ADS_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
      body: await req.text(),
    })
  } else {
    return deny(404, 'Not found', cors)
  }

  const responseHeaders: Record<string, string> = { ...cors }
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders[name] = value
  }
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  })
})
