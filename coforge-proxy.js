#!/usr/bin/env node
/**
 * Coforge API Proxy
 *
 * This proxy transforms Surf's `Authorization: Bearer <key>` header
 * into `X-API-KEY: <key>` for your company's LLM router.
 *
 * Usage:
 *   1. Set your API key: export COFORGE_API_KEY="your-api-key"
 *   2. Run: node coforge-proxy.js
 *   3. In Surf, add custom model with URL: http://localhost:3456/v1/chat/completions
 */

const http = require('http')
const https = require('https')

const PROXY_PORT = 3456
const COFORGE_API_URL = 'https://quasarmarket.coforge.com/qag/llmrouter-api/v2/chat/completions'
const API_KEY = process.env.COFORGE_API_KEY

if (!API_KEY) {
  console.error('❌ Error: COFORGE_API_KEY environment variable not set')
  console.error('   Run: export COFORGE_API_KEY="your-api-key"')
  process.exit(1)
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })

  req.on('end', () => {
    const url = new URL(COFORGE_API_URL)

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY // Transform header here!
      }
    }

    console.log(`📤 Proxying request to Coforge API...`)

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
      console.log(`📥 Response: ${proxyRes.statusCode}`)
    })

    proxyReq.on('error', (e) => {
      console.error(`❌ Proxy error: ${e.message}`)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })

    proxyReq.write(body)
    proxyReq.end()
  })
})

server.listen(PROXY_PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           🚀 Coforge API Proxy Running                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Local URL:  http://localhost:${PROXY_PORT}/v1/chat/completions       ║
║  Target:     ${COFORGE_API_URL.substring(0, 50)}... ║
║  Model:      kimi-k2-thinking                                 ║
╚═══════════════════════════════════════════════════════════════╝

📝 In Surf Settings → AI → Add Custom Model:
   • Provider URL: http://localhost:${PROXY_PORT}/v1/chat/completions
   • Model ID:     kimi-k2-thinking
   • API Key:      (leave empty - proxy handles it)
`)
})
