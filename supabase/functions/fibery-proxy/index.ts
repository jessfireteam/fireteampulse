import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Allowed origins for CORS - restrict to known domains
const ALLOWED_ORIGINS = [
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
    origin.endsWith('.lovableproject.com')
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
const ALLOWED_QUERY_TYPES = ['projects', 'tasks', 'pending-tasks', 'client-months', 'client-weeks', 'project-completions', 'project-upcoming', 'project-timeline-upcoming', 'project-pacing', 'shipped-tasks', 'client-expenses', 'creator-costs', 'leads', 'stage-tracking'] as const
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
  'tasks': `{
    findProjectSpecificTasks(
      limit: 2000
      done: { is: true }
      doneDate: { greater: "2026-01-01" }
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
      }
    }
  }`,
  'pending-tasks': `{
    findProjectSpecificTasks(
      limit: 1000
      done: { is: false }
      dueDate: { greater: "2026-01-01" }
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
      }
    }
  }`,
  'client-months': `{
    findClientMonths(limit: 200) {
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
  }`,
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
  'stage-tracking': 'DYNAMIC'
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

serve(async (req) => {
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
    const { data, error: authError } = await supabaseClient.auth.getClaims(token)
    
    if (authError || !data?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Server-side domain validation - enforce @fireteam.is restriction
    const email = data.claims.email as string | undefined
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

    const { queryType } = await req.json()

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

    // Dynamic query for client-weeks: fetch last ~10 weeks of data
    if (queryType === 'client-weeks') {
      const now = new Date()
      const tenWeeksAgo = new Date(now.getTime() - 10 * 7 * 24 * 60 * 60 * 1000)
      const startDate = tenWeeksAgo.toISOString().split('T')[0]
      const endDate = now.toISOString().split('T')[0]
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