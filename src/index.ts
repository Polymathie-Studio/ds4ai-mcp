#!/usr/bin/env node
/**
 * DS4AI MCP server - stdio transport entry point.
 *
 * Server construction lives in ./create-server.ts, shared with the HTTP
 * entry point (./http.ts). See create-server.ts for what the server serves.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './create-server.js'

const server = createMcpServer()
await server.connect(new StdioServerTransport())
