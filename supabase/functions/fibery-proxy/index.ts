import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const FIBERY_TOKEN = Deno.env.get('FIBERY_TOKEN')
    if (!FIBERY_TOKEN) {
      throw new Error('FIBERY_TOKEN is not configured')
    }

    const { endpoint, query } = await req.json()

    console.log('Received request with endpoint:', endpoint)
    console.log('Query:', query)

    if (!endpoint || !query) {
      throw new Error('Missing endpoint or query parameter')
    }

    // Determine the Fibery URL based on endpoint type
    let url: string
    if (endpoint === 'stats') {
      url = 'https://fireteam.fibery.io/api/graphql/space/Stats'
    } else {
      url = 'https://fireteam.fibery.io/api/graphql/space/Projects'
    }

    console.log('Proxying request to:', url)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${FIBERY_TOKEN}`
      },
      body: JSON.stringify({ query })
    })

    const responseText = await response.text()
    console.log('Fibery response status:', response.status)
    console.log('Fibery response body:', responseText)

    if (!response.ok) {
      console.error(`Fibery API error [${response.status}]:`, responseText)
      throw new Error(`Fibery API error: ${response.status}`)
    }

    const data = JSON.parse(responseText)
    console.log('Parsed data:', JSON.stringify(data, null, 2))

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  } catch (error: unknown) {
    console.error('Proxy error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
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