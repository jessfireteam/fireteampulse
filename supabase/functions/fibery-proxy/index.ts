import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// FB Ads Supabase project (ojqdhqbynccwgowbzhir). Anonymous access to it was
// revoked 2026-08-28; reads go through its spend-proxy edge function, which
// re-verifies the caller's JWT we forward. See supabase/functions/spend-proxy.
const SPEND_PROXY_URL = 'https://ojqdhqbynccwgowbzhir.supabase.co/functions/v1/spend-proxy'

// Calls one of spend-proxy's whitelisted read-only RPCs, forwarding the JWT of
// the user this request is being served for. Mirrors supabase-js's rpc()
// return shape so the call sites read the same as they did with a direct client.
async function spendProxyRpc(
  fn: string,
  args: Record<string, number>,
  authHeader: string,
): Promise<{ data: unknown; error: { message: string } | null }> {
  try {
    const res = await fetch(`${SPEND_PROXY_URL}/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 120)
      return { data: null, error: { message: `spend-proxy ${fn}: ${res.status} ${detail}` } }
    }
    return { data: await res.json(), error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { data: null, error: { message: `spend-proxy ${fn} unreachable: ${message}` } }
  }
}

// Allowed origins for CORS - restrict to known domains
const ALLOWED_ORIGINS = [
  'https://pulse.fireteam.is',
  'https://fireteam-pulse.netlify.app',
  'https://fireteampulse.lovable.app',
  'https://id-preview--a96a0ee1-3f6c-4df3-bcd1-42986223e293.lovable.app',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
]

// Generate CORS headers with origin validation
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && (
    ALLOWED_ORIGINS.some(allowed => origin === allowed) ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com') ||
    origin.endsWith('.netlify.app')
  ) ? origin : ALLOWED_ORIGINS[0]
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// Allowed email domain for access control
const ALLOWED_EMAIL_DOMAIN = '@fireteam.is'

// Whitelisted query types - only these are allowed
const ALLOWED_QUERY_TYPES = ['projects', 'tasks', 'pending-tasks', 'client-months', 'client-weeks', 'project-completions', 'project-upcoming', 'project-timeline-upcoming', 'project-pacing', 'shipped-tasks', 'client-expenses', 'creator-costs', 'leads', 'stage-tracking', 'clients', 'client-plans', 'winners', 'slack-highlights', 'revision-stats'] as const
type QueryType = typeof ALLOWED_QUERY_TYPES[number]

// Predefined queries for security - no arbitrary GraphQL allowed
const QUERIES: Record<QueryType, string> = {
  'projects': `{
    findProjects(
      limit: 1000
      status: { name: { is: "Completed" } }
      orderBy: { doneDate: DESC }
    ) {
      id
      name
      doneDate
      client { name }
      type { name }
    }
  }`,
  'tasks': 'DYNAMIC',
  'pending-tasks': 'DYNAMIC',
  'client-months': 'DYNAMIC',
  'client-weeks': 'DYNAMIC',
  'project-completions': `{
    findProjects(
      limit: 3000
      doneDate: { greater: "2025-09-01" }
      orderBy: { doneDate: ASC }
    ) {
      client { name }
      name
      doneDate
      dueDate
      type { name }
    }
  }`,
  'project-upcoming': 'DYNAMIC',
  'project-timeline-upcoming': 'DYNAMIC',
  'project-pacing': 'DYNAMIC',
  'shipped-tasks': 'DYNAMIC',
  'client-expenses': 'DYNAMIC',
  'creator-costs': 'DYNAMIC',
  'leads': `{
    findCompanies(
      limit: 500
      orderBy: { lastContacted: DESC }
    ) {
      name
      email
      website
      stage { name }
      lastContacted
      firstContact
      daysSinceLastContact
      creationDate
      owner { name }
      contacts { name normalisedEmail }
    }
  }`,
  'stage-tracking': 'DYNAMIC',
  'clients': `{
    findClients(
      limit: 500
    ) {
      name
      status { name }
    }
  }`,
  // Deliberately separate from 'clients' rather than extra fields on it. Half the dashboard
  // depends on 'clients' resolving, and these two field names are a convention guess about
  // Fibery's GraphQL naming, so a wrong guess must not be able to take that query down.
  'client-plans': `{
    findClients(
      limit: 500
    ) {
      name
      maxDeliverablesPerMonth
      minDeliverablesPerMonth
    }
  }`,
  'winners': 'DYNAMIC',
  'slack-highlights': 'DYNAMIC',
  'revision-stats': 'DYNAMIC',
}

// Fibery rejects any limit above 3000 ("limit is out of range 0, 3001"), so
// that is the page size, and MAX_PAGES is a runaway guard rather than a real
// ceiling (24k projects is years of headroom at current volume).
const WINNERS_PAGE_SIZE = 3000
const WINNERS_MAX_PAGES = 8

// Map query types to their Fibery endpoints
const QUERY_ENDPOINTS: Record<QueryType, string> = {
  'projects': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'tasks': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'pending-tasks': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'client-months': 'https://fireteam.fibery.io/api/graphql/space/Stats',
  'client-weeks': 'https://fireteam.fibery.io/api/graphql/space/Stats',
  'project-completions': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'project-upcoming': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'project-timeline-upcoming': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'project-pacing': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'shipped-tasks': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'client-expenses': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'creator-costs': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'leads': 'https://fireteam.fibery.io/api/graphql/space/Leads',
  'stage-tracking': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'clients': 'https://fireteam.fibery.io/api/graphql/space/Clients',
  'client-plans': 'https://fireteam.fibery.io/api/graphql/space/Clients',
  'winners': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'slack-highlights': '',  // handled before reaching the generic Fibery fetch
  'revision-stats': 'https://fireteam.fibery.io/api/graphql/space/Projects',
}

// Retry with exponential backoff for rate limiting
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429 && attempt < maxRetries) {
      const waitTime = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded');
}

// Fibery never says "I truncated your result" — it just hands back exactly as
// many rows as you asked for and stays quiet, so any total derived from it reads
// low and nothing looks broken. A single-shot query that comes back holding
// precisely its own limit is therefore treated as truncated until proven
// otherwise. Returns the offending "field=count" pairs, empty if clean.
function detectTruncatedCollections(query: string, data: unknown): string[] {
  const limits = [...query.matchAll(/limit:\s*(\d+)/g)].map((m) => Number(m[1]))
  if (!limits.length || !data || typeof data !== 'object') return []
  return Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => Array.isArray(value) && limits.includes(value.length))
    .map(([field, value]) => `${field}=${(value as unknown[]).length}`)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !userData?.user) {
      console.error('Auth failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: authError?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Server-side domain validation - enforce @fireteam.is restriction
    const email = userData.user.email
    if (!email || !email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return new Response(
        JSON.stringify({ error: 'Access restricted to FireTeam members' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const FIBERY_TOKEN = Deno.env.get('FIBERY_TOKEN')
    if (!FIBERY_TOKEN) {
      console.error('Service configuration error')
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const body = await req.json()
    const { queryType, channelId } = body

    // Validate query type against whitelist
    if (!queryType || !ALLOWED_QUERY_TYPES.includes(queryType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid query type' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let query = QUERIES[queryType as QueryType]
    const url = QUERY_ENDPOINTS[queryType as QueryType]
    // Set by the winners branch below; when non-null the request is served by
    // the paged loop instead of the single-shot fetch at the end.
    let paginateWinners: ((offset: number) => string) | null = null

    // Dynamic query for tasks: fetch completed tasks from last 7 months (covers 26-week peak calc)
    if (queryType === 'tasks') {
      const now = new Date()
      const sevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1)
      const sevenMonthsAgoDate = sevenMonthsAgo.toISOString().split('T')[0]
      query = `{
        findProjectSpecificTasks(
          limit: 3000
          done: { is: true }
          doneDate: { greater: "${sevenMonthsAgoDate}" }
          orderBy: { doneDate: DESC }
        ) {
          id
          name
          done
          doneDate
          dueDate
          assignee { name }
          taskTemplateRole { name }
          project { 
            name 
            client { name }
            status { name }
          }
        }
      }`
    }

    // Dynamic query for pending-tasks: fetch all undone tasks with due dates
    if (queryType === 'pending-tasks') {
      const now = new Date()
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      const threeMonthsAgoDate = threeMonthsAgo.toISOString().split('T')[0]
      query = `{
        findProjectSpecificTasks(
          limit: 3000
          done: { is: false }
          dueDate: { greater: "${threeMonthsAgoDate}" }
          orderBy: { dueDate: DESC }
        ) {
          id
          name
          done
          doneDate
          dueDate
          assignee { name }
          taskTemplateRole { name }
          project { 
            name 
            client { name }
            status { name }
          }
        }
      }`
    }

    // client-weeks: pull directly from FB Ads Supabase — Fibery's ClientWeeks entity
    // is sparsely populated and misses most clients. Supabase has full history.
    if (queryType === 'client-weeks') {
      try {
        const { data: weekRows, error: weekError } = await spendProxyRpc(
          'get_weekly_spend_by_client', { weeks_back: 12 }, authHeader)

        if (weekError) {
          console.error('Weekly spend fetch error:', weekError.message)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch weekly spend', detail: weekError.message }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Compute ISO week number from a YYYY-MM-DD Monday date
        function isoWeekNum(dateStr: string): number {
          const d = new Date(dateStr + 'T00:00:00Z')
          const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
          const startOfWeek1 = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000)
          return Math.floor((d.getTime() - startOfWeek1.getTime()) / (7 * 86400000)) + 1
        }

        type WeekRow = { client_name: string; week_start: string; week_end: string; total_spend: number; ft_spend: number }
        const findClientWeeks = (weekRows as WeekRow[]).map(row => {
          const totalSpend = Number(row.total_spend) || 0
          const ftSpend = Number(row.ft_spend) || 0
          const agencyFraction = totalSpend > 0 ? ftSpend / totalSpend : 0
          const weekNum = isoWeekNum(row.week_start)
          const year = row.week_start.substring(0, 4)
          return {
            client: { name: row.client_name },
            totalSpend,
            agencySpend: agencyFraction,
            dateRange: { start: row.week_start, end: row.week_end },
            week: { name: `W${weekNum} ${year}`, isoWeeknum: weekNum, current: false },
          }
        })

        return new Response(
          JSON.stringify({ data: { findClientWeeks } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (err) {
        console.error('Weekly spend threw:', err)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch weekly spend' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Dynamic query for client-months: fetch last 6 months of data
    // Name format is "YYYY-MM - ClientName", so we filter by name range
    // Spend figures (totalSpend, fireTeamSpend) are overridden with accurate
    // data from the FB Ads Supabase project; Fibery provides deliverables data only.
    if (queryType === 'client-months') {
      const now = new Date()
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
      const lowerBound = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`
      // Upper bound: next month (to include current month)
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const upperBound = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
      query = `{
        findClientMonths(
          limit: 1000
          orderBy: { name: DESC }
          name: { greaterOrEquals: "${lowerBound}", less: "${upperBound}" }
        ) {
          id
          name
          client { name }
          totalSpend
          fireTeamSpend
          pricingPlanMonths {
            revenue
            costPerDeliverable
            deliverablesShipped
          }
        }
      }`

      // Fetch from Fibery first
      const fiberyResponse = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${FIBERY_TOKEN}`
        },
        body: JSON.stringify({ query })
      })
      const fiberyText = await fiberyResponse.text()
      if (!fiberyResponse.ok) {
        console.error(`Fibery error for client-months: status=${fiberyResponse.status}`)
        return new Response(
          JSON.stringify({ error: 'External API error', status: fiberyResponse.status, detail: fiberyText.substring(0, 200) }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const fiberyData = JSON.parse(fiberyText)

      // Fetch accurate spend totals AND computed fees from the FB Ads Supabase project
      let spendLookup: Record<string, { total_spend: number; ft_spend: number }> = {}
      let feeLookup: Record<string, number> = {}
      try {
        const [spendResult, feeResult] = await Promise.all([
          spendProxyRpc('get_monthly_spend_by_client', { months_back: 7 }, authHeader),
          spendProxyRpc('get_monthly_fee_by_client', { months_back: 7 }, authHeader),
        ])
        if (spendResult.error) {
          console.error('FB Ads spend fetch error:', spendResult.error.message)
        } else if (spendResult.data) {
          for (const row of spendResult.data as Array<{ client_name: string; month: string; total_spend: number; ft_spend: number }>) {
            const key = `${row.client_name.trim().toLowerCase()}__${row.month}`
            spendLookup[key] = { total_spend: Number(row.total_spend) || 0, ft_spend: Number(row.ft_spend) || 0 }
          }
        }
        if (feeResult.error) {
          console.error('FB Ads fee fetch error:', feeResult.error.message)
        } else if (feeResult.data) {
          for (const row of feeResult.data as Array<{ client_name: string; month: string; computed_fee: number }>) {
            const key = `${row.client_name.trim().toLowerCase()}__${row.month}`
            feeLookup[key] = Number(row.computed_fee) || 0
          }
        }
      } catch (spendFetchErr) {
        // Non-fatal: if FB Ads query fails, fall back to Fibery spend values
        console.error('FB Ads spend fetch threw:', spendFetchErr)
      }

      // Merge: override totalSpend/fireTeamSpend and add computedRevenue on each Fibery record
      if (fiberyData?.data?.findClientMonths) {
        fiberyData.data.findClientMonths = fiberyData.data.findClientMonths.map(
          (cm: { name: string; client: { name: string } | null; totalSpend: number | null; fireTeamSpend: number | null }) => {
            const clientName = cm.client?.name?.trim()
            const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/)
            if (!clientName || !monthMatch) return cm
            const key = `${clientName.toLowerCase()}__${monthMatch[1]}`
            const supabaseSpend = spendLookup[key]
            const computedRevenue = feeLookup[key] ?? null
            return {
              ...cm,
              ...(supabaseSpend ? {
                totalSpend: supabaseSpend.total_spend,
                fireTeamSpend: supabaseSpend.ft_spend,
              } : {}),
              computedRevenue,
            }
          }
        )
      }

      return new Response(JSON.stringify(fiberyData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Dynamic query for project-upcoming: fetch projects due in current calendar month that aren't done
    if (queryType === 'project-upcoming') {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthStartDate = monthStart.toISOString().split('T')[0]
      const nextMonthStartDate = nextMonthStart.toISOString().split('T')[0]
      query = `{
        findProjects(
          limit: 1000
          dueDate: { greaterOrEquals: "${monthStartDate}", less: "${nextMonthStartDate}" }
          doneDate: { isNull: true }
          orderBy: { dueDate: ASC }
        ) {
          client { name }
          name
          dueDate
        }
      }`
    }

    // Dynamic query for project-timeline-upcoming: fetch undone projects due in next 6 weeks
    if (queryType === 'project-timeline-upcoming') {
      const now = new Date()
      const todayDate = now.toISOString().split('T')[0]
      query = `{
        findProjects(
          limit: 3000
          dueDate: { greaterOrEquals: "${todayDate}" }
          doneDate: { isNull: true }
          orderBy: { dueDate: ASC }
        ) {
          client { name }
          name
          dueDate
          type { name }
        }
      }`
    }

    // Dynamic query for project-pacing: fetch projects created in last 2 months with shipped info
    if (queryType === 'project-pacing') {
      const now = new Date()
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthStartDate = prevMonthStart.toISOString().split('T')[0]
      query = `{
        findProjects(
          limit: 3000
          creationDate: { greater: "${prevMonthStartDate}" }
          orderBy: { creationDate: ASC }
        ) {
          name
          creationDate
          shippedDay { date }
        }
      }`
    }

    // Dynamic query for shipped-tasks: find "send ad to client" tasks done since
    // the start of last month.
    //
    // The name filter has to run here, on Fibery's side, not in the browser.
    // Until 2026-08-31 this asked for EVERY done task in the window and let the
    // client keep the tenth of them that are sends. But each project carries
    // eight to ten tasks, so the window held 3600+ rows against Fibery's 3000
    // cap, and with no orderBy Fibery returns oldest-created-first — so the cap
    // dropped every task created after roughly the 16th of last month. August
    // 2026 read 90 sends on the dashboard against 189 in Fibery. Filtering here
    // takes two months down to ~365 rows. orderBy is belt-and-braces: if volume
    // ever does pass the cap, the rows that survive are the newest ones rather
    // than an arbitrary slice.
    if (queryType === 'shipped-tasks') {
      const now = new Date()
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthStartDate = prevMonthStart.toISOString().split('T')[0]
      query = `{
        findProjectSpecificTasks(
          limit: 3000
          done: { is: true }
          doneDate: { greater: "${prevMonthStartDate}" }
          name: { contains: "send ad to client" }
          orderBy: { doneDate: DESC }
        ) {
          name
          doneDate
          project { name client { name } creationDate }
        }
      }`
    }

    // Dynamic query for client-expenses: fetch expenses from last 5 months
    if (queryType === 'client-expenses') {
      const now = new Date()
      const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      const fiveMonthsAgoDate = fiveMonthsAgo.toISOString().split('T')[0]
      query = `{
        findExpenses(
          limit: 3000
          date: { greater: "${fiveMonthsAgoDate}" }
          orderBy: { date: ASC }
        ) {
          name
          amount
          date
          paid
          billedToClient
          client { name }
        }
      }`
    }

    // Dynamic query for creator-costs: fetch expenses from last 12 months with projects
    if (queryType === 'creator-costs') {
      const now = new Date()
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1)
      const twelveMonthsAgoDate = twelveMonthsAgo.toISOString().split('T')[0]
      query = `{
        findExpenses(
          limit: 3000
          date: { greater: "${twelveMonthsAgoDate}" }
          orderBy: { date: ASC }
        ) {
          name
          amount
          date
          client { name }
        }
      }`
    }

    // Dynamic query for stage-tracking: fetch stage tracking entries from last 60 days (for current + previous 30d comparison)
    if (queryType === 'stage-tracking') {
      const now = new Date()
      const lookbackDays = 200 // ~6.5 months to cover 6-month average + current 30d
      const lookbackDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
      const lookbackDateStr = lookbackDate.toISOString().split('T')[0]
      query = `{
        findStageTrackings(
          limit: 3000
          creationDate: { greater: "${lookbackDateStr}" }
          orderBy: { creationDate: DESC }
        ) {
          stage {
            name
          }
          duration
          project {
            name
            type { name }
          }
          creationDate
        }
      }`
    }

    // Dynamic query for winners: fetch all projects with roles, contractors, and version tags.
    //
    // Fibery hard-caps `limit` at 3000 per call, and as of 2026-08-10 there were
    // ~2.8k non-retired tracked projects, so a single call was already about to
    // start silently dropping the oldest months of winner tracking (the oldest
    // row it returned was 2025-09-25, three weeks after tracking began). So this
    // pages with `offset` until a short page comes back, and filters server-side
    // to the tracking window — keep the date in step with WINNERS_TRACKING_START
    // in src/hooks/useWinnersData.ts.
    if (queryType === 'winners') {
      paginateWinners = (offset: number) => `{
        findProjects(
          orderBy: { creationDate: DESC }
          creationDate: { greater: "2025-08-31" }
          limit: ${WINNERS_PAGE_SIZE}
          offset: ${offset}
        ) {
          id
          name
          creationDate
          doneDate
          status { name }
          client {
            id
            name
          }
          type {
            name
          }
          projectRolesInternal {
            assignee {
              id
              name
            }
            role {
              id
              name
              publicId
            }
          }
          projectContractorsExternal {
            id
            contractor {
              id
              name
            }
            role {
              id
              name
              publicId
            }
          }
          internalVersions {
            id
            name
            winnerDate
            tags {
              id
              name
            }
          }
        }
      }`
    }

    // Dynamic query for revision-stats: fetch completed projects with version send-to-client counts
    if (queryType === 'revision-stats') {
      const now = new Date()
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
      const sixMonthsAgoDate = sixMonthsAgo.toISOString().split('T')[0]
      query = `{
        findProjects(
          limit: 3000
          doneDate: { greater: "${sixMonthsAgoDate}" }
          orderBy: { doneDate: DESC }
        ) {
          name
          doneDate
          client { name }
          type { name }
          internalVersions {
            sendToClient
          }
        }
      }`
    }

    // Slack highlights — fetch recent messages from a client channel
    if (queryType === 'slack-highlights') {
      const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
      if (!SLACK_TOKEN) {
        return new Response(
          JSON.stringify({ messages: [], error: 'Slack not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!channelId) {
        return new Response(
          JSON.stringify({ messages: [], error: 'channelId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
      const histRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${thirtyDaysAgo}&limit=20`,
        { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
      )
      const histData = await histRes.json()

      if (!histData.ok) {
        console.error('Slack history error:', histData.error)
        return new Response(
          JSON.stringify({ messages: [], error: histData.error }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      type SlackRawMsg = { ts: string; text?: string; user?: string; bot_id?: string; subtype?: string }
      const filtered = ((histData.messages || []) as SlackRawMsg[])
        .filter(m => m.text?.trim() && m.subtype !== 'channel_join' && m.subtype !== 'channel_leave')
        .slice(0, 15)

      // Resolve unique user names in parallel
      const userIds = [...new Set(filtered.filter(m => m.user).map(m => m.user!))]
      const userNames: Record<string, string> = {}
      await Promise.all(userIds.map(async (uid) => {
        try {
          const res = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
            headers: { Authorization: `Bearer ${SLACK_TOKEN}` }
          })
          const data = await res.json()
          if (data.ok) {
            userNames[uid] = data.user?.profile?.display_name || data.user?.real_name || data.user?.name || uid
          }
        } catch { /* fall back to uid */ }
        if (!userNames[uid]) userNames[uid] = uid
      }))

      const messages = filtered.reverse().map(m => ({
        authorName: m.user ? (userNames[m.user] || m.user) : 'Bot',
        text: m.text!
          .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')
          .replace(/<@[A-Z0-9]+>/g, '@someone')
          .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
          .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
          .replace(/<([^>]+)>/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .trim(),
        date: new Date(parseFloat(m.ts) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      })).filter(m => m.text)

      if (messages.length === 0) {
        return new Response(JSON.stringify({ bullets: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Summarize into actionable bullets using Claude
      const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
      if (!ANTHROPIC_KEY) {
        // Fallback: return raw messages if no AI key
        return new Response(JSON.stringify({ bullets: messages.map(m => `${m.date} — ${m.authorName}: ${m.text}`) }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const transcript = messages.map(m => `[${m.date}] ${m.authorName}: ${m.text}`).join('\n')
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `These are recent Slack messages from a client channel at a performance marketing agency. Summarize into 3-6 concise bullet points for an account manager. Focus on: open action items, decisions made, things waiting on responses, and notable creative or performance updates. Skip small talk and pleasantries. Be specific — include names, creative names, or specific asks where relevant. Return only the bullet points, one per line, each starting with "•".\n\nMessages:\n${transcript}`
          }]
        })
      })

      let bullets: string[] = []
      if (aiRes.ok) {
        const aiData = await aiRes.json()
        const content = aiData.content?.[0]?.text ?? ''
        bullets = content
          .split('\n')
          .map((line: string) => line.replace(/^[•\-*]\s*/, '').trim())
          .filter((line: string) => line.length > 0)
      } else {
        console.error('Anthropic error:', await aiRes.text())
        bullets = messages.slice(0, 5).map(m => `${m.authorName} (${m.date}): ${m.text.substring(0, 120)}`)
      }

      return new Response(JSON.stringify({ bullets }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Paged path (winners only): keep asking for the next page until Fibery
    // returns a short one, then hand back a single merged findProjects array so
    // the client sees exactly the same shape as before.
    if (paginateWinners) {
      const merged: unknown[] = []
      for (let page = 0; page < WINNERS_MAX_PAGES; page++) {
        const pageRes = await fetchWithRetry(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${FIBERY_TOKEN}` },
          body: JSON.stringify({ query: paginateWinners(page * WINNERS_PAGE_SIZE) })
        })
        const pageText = await pageRes.text()
        if (!pageRes.ok) {
          console.error(`External API error: status=${pageRes.status}, body=${pageText.substring(0, 500)}, queryType=winners, page=${page}`)
          return new Response(
            JSON.stringify({ error: 'External API error', status: pageRes.status, detail: pageText.substring(0, 200) }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const pageData = JSON.parse(pageText)
        if (pageData.errors?.length) {
          console.error(`Fibery GraphQL error on winners page ${page}: ${JSON.stringify(pageData.errors).substring(0, 300)}`)
          return new Response(JSON.stringify(pageData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const rows = pageData?.data?.findProjects ?? []
        merged.push(...rows)
        if (rows.length < WINNERS_PAGE_SIZE) break
        if (page === WINNERS_MAX_PAGES - 1) {
          // Better a loud log than a silently truncated dataset — this is the
          // exact failure the pagination was added to remove.
          console.error(`winners pagination hit WINNERS_MAX_PAGES (${WINNERS_MAX_PAGES}); dataset may be truncated at ${merged.length} projects`)
        }
      }
      console.log(`winners: returned ${merged.length} projects`)
      return new Response(JSON.stringify({ data: { findProjects: merged } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${FIBERY_TOKEN}`
      },
      body: JSON.stringify({ query })
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error(`External API error: status=${response.status}, body=${responseText.substring(0, 500)}, queryType=${queryType}`)
      return new Response(
        JSON.stringify({ error: 'External API error', status: response.status, detail: responseText.substring(0, 200) }),
        { 
          status: 502, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const responseData = JSON.parse(responseText)

    // Row caps have quietly wrecked numbers on this dashboard more than once, so
    // say so in the logs the moment a result comes back full to the brim. The
    // flag rides along in the payload too, for a consumer that wants to warn
    // instead of drawing a number it cannot stand behind (none read it yet).
    const truncated = detectTruncatedCollections(query, responseData?.data)
    if (truncated.length) {
      console.error(
        `Row cap hit: queryType=${queryType} ${truncated.join(' ')} — result is truncated, totals derived from it read low`
      )
      responseData.truncated = truncated
    }

    return new Response(JSON.stringify(responseData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  } catch (error: unknown) {
    console.error('Request failed')
    return new Response(
      JSON.stringify({ error: 'Request failed' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }
})
