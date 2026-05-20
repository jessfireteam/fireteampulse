import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// FB Ads Supabase project — read-only anon key (public, safe to include here)
// Project: ojqdhqbynccwgowbzhir (Facebook ad spend data)
const FB_ADS_SUPABASE_URL = 'https://ojqdhqbynccwgowbzhir.supabase.co'
const FB_ADS_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcWRocWJ5bmNjd2dvd2J6aGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTU1MzYsImV4cCI6MjA5MzY3MTUzNn0.nuN06cCiUSvbjco5ZH8Ka1D9WJBK43zlHH1O0R26QYQ'

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
const ALLOWED_QUERY_TYPES = ['projects', 'tasks', 'pending-tasks', 'client-months', 'client-weeks', 'project-completions', 'project-upcoming', 'project-timeline-upcoming', 'project-pacing', 'shipped-tasks', 'client-expenses', 'creator-costs', 'leads', 'stage-tracking', 'clients', 'winners', 'slack-highlights', 'revision-stats'] as const
type QueryType = typeof ALLOWED_QUERY_TYPES[number]

// Predefined queries for security - no arbitrary GraphQL allowed
const QUERIES: Record<QueryType, string> = {
  'projects': `{
    findProjects(
      limit: 1000
      status: { name: { is: "Completed" } }
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
  'winners': 'DYNAMIC',
  'slack-highlights': 'DYNAMIC',
  'revision-stats': 'DYNAMIC',
}

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

    // Dynamic query for client-weeks: fetch last ~10 weeks of data
    if (queryType === 'client-weeks') {
      const now = new Date()
      const tenWeeksAgo = new Date(now.getTime() - 10 * 7 * 24 * 60 * 60 * 1000)
      const startDate = tenWeeksAgo.toISOString().split('T')[0]
      // Use end of current week to include current week's data
      const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const endDate = endOfWeek.toISOString().split('T')[0]
      query = `{
        findClientWeeks(
          limit: 500
          orderBy: { dateRange: { start: ASC } }
          dateRange: { start: { greaterOrEquals: "${startDate}", less: "${endDate}" } }
        ) {
          client { name }
          totalSpend
          agencySpend
          dateRange { start end }
          week { name isoWeeknum current }
        }
      }`
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

      // Fetch accurate spend totals from the FB Ads Supabase project
      let spendLookup: Record<string, { total_spend: number; ft_spend: number }> = {}
      try {
        const fbClient = createClient(FB_ADS_SUPABASE_URL, FB_ADS_ANON_KEY)
        const { data: spendRows, error: spendError } = await fbClient
          .rpc('get_monthly_spend_by_client', { months_back: 7 })
        if (spendError) {
          console.error('FB Ads spend fetch error:', spendError.message)
        } else if (spendRows) {
          for (const row of spendRows as Array<{ client_name: string; month: string; total_spend: number; ft_spend: number }>) {
            const key = `${row.client_name.trim().toLowerCase()}__${row.month}`
            spendLookup[key] = { total_spend: Number(row.total_spend) || 0, ft_spend: Number(row.ft_spend) || 0 }
          }
        }
      } catch (spendFetchErr) {
        // Non-fatal: if FB Ads query fails, fall back to Fibery spend values
        console.error('FB Ads spend fetch threw:', spendFetchErr)
      }

      // Merge: override totalSpend/fireTeamSpend on each Fibery record if Supabase has data
      if (fiberyData?.data?.findClientMonths && Object.keys(spendLookup).length > 0) {
        fiberyData.data.findClientMonths = fiberyData.data.findClientMonths.map(
          (cm: { name: string; client: { name: string } | null; totalSpend: number | null; fireTeamSpend: number | null }) => {
            const clientName = cm.client?.name?.trim()
            const monthMatch = cm.name?.match(/^(\d{4}-\d{2})/)
            if (!clientName || !monthMatch) return cm
            const key = `${clientName.toLowerCase()}__${monthMatch[1]}`
            const supabaseSpend = spendLookup[key]
            if (supabaseSpend) {
              return {
                ...cm,
                totalSpend: supabaseSpend.total_spend,
                fireTeamSpend: supabaseSpend.ft_spend,
              }
            }
            return cm
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

    // Dynamic query for shipped-tasks: find "send ad to client" tasks done in last 2 months
    if (queryType === 'shipped-tasks') {
      const now = new Date()
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthStartDate = prevMonthStart.toISOString().split('T')[0]
      query = `{
        findProjectSpecificTasks(
          limit: 3000
          done: { is: true }
          doneDate: { greater: "${prevMonthStartDate}" }
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

    // Dynamic query for winners: fetch all projects with roles, contractors, and version tags
    if (queryType === 'winners') {
      query = `{
        findProjects(
          orderBy: { creationDate: DESC }
          limit: 3000
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
        ts: m.ts,
        text: m.text!,
        authorName: m.user ? (userNames[m.user] || m.user) : 'Bot',
        isoDate: new Date(parseFloat(m.ts) * 1000).toISOString(),
      }))

      return new Response(JSON.stringify({ messages }), {
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
