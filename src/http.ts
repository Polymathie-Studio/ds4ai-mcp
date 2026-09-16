#!/usr/bin/env node
/**
 * DS4AI MCP server - HTTP transport entry point.
 *
 * Stateless Streamable HTTP MCP server. Each request gets a fresh
 * server+transport pair. No session state is maintained.
 *
 * Deploy to Railway, Render, or any Node.js host. Set PORT env var if needed.
 */

import { createServer as createHttpServer } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from './create-server.js'

const PORT = Number(process.env['PORT'] ?? 3000)

const httpServer = createHttpServer(async (req, res) => {
  // Health check
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION }))
    return
  }

  // MCP endpoint
  if (req.url === '/mcp') {
    if (req.method === 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Use POST for Streamable HTTP or see /health' }))
      return
    }

    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = Buffer.concat(chunks).toString('utf8')

      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(body)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }

      // Stateless mode: sessionIdGenerator must be undefined. A fresh
      // transport+server pair is created per request and discarded after, so
      // there is no session to carry across requests. Setting a generator here
      // puts the SDK transport into stateful mode, where every non-initialize
      // request lands on a transport whose _initialized is false and is rejected
      // with "Bad Request: Server not initialized".
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      const server = createMcpServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, parsedBody)
      return
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found. MCP endpoint is POST /mcp' }))
})

httpServer.listen(PORT, () => {
  console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} listening on port ${PORT}`)
  console.error(`MCP endpoint: http://localhost:${PORT}/mcp`)
})
