import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Whitelisted query types - only these are allowed
const ALLOWED_QUERY_TYPES = ['projects', 'tasks', 'pending-tasks', 'client-months'] as const
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
  }`
}

// Map query types to their Fibery endpoints
const QUERY_ENDPOINTS: Record<QueryType, string> = {
  'projects': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'tasks': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'pending-tasks': 'https://fireteam.fibery.io/api/graphql/space/Projects',
  'client-months': 'https://fireteam.fibery.io/api/graphql/space/Stats',
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

    const query = QUERIES[queryType as QueryType]
    const url = QUERY_ENDPOINTS[queryType as QueryType]

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
      console.error('External API error')
      return new Response(
        JSON.stringify({ error: 'External API error' }),
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