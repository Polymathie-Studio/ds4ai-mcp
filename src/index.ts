#!/usr/bin/env node
/**
 * DS4AI MCP server.
 *
 * Serves DS4AI, the Design Suite for AI, from Polymathie-Studio, as callable
 * MCP tools, so a person working with an AI reaches the conformance auditor and
 * the generators through their agent. Unlike the @proof-of-coord standards
 * servers, which are pointer-and-metadata layers, this server runs the
 * primitives: its tools execute the real logic, and because it is a Node process
 * it can fetch a URL and audit the served HTML.
 *
 * The family manifest, the AGENTS.md agent-instruction, and the MISSING standard
 * are served as resources. The manifest is read generically as a data source
 * rather than hardcoded, so a later alignment of its shape to a cross-family base
 * schema needs no change here.
 *
 * License: Apache-2.0.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { safeFetchSurface, UnsafeUrlError } from './safe-fetch.js'

// The bundled primitives (vendored zero-dependency ES modules).
import { composedAudit } from './composed-audit.js'
import { head, htmlAttrs, jsonLd, sitemap as beaconSitemap, robots as beaconRobots, audit as auditFindability } from './vendor/beacon.js'
import { img, picture, cacheHeaders, audit as auditDelivery } from './vendor/fleet.js'
import { deriveByKey, contrast } from './vendor/derive.js'

const res = (name: string) => readFileSync(new URL('../resources/' + name, import.meta.url), 'utf8')
const manifest = JSON.parse(res('manifest.json'))

const SERVER_VERSION = '0.1.0'
// Primitive versions, read generically from the manifest so provenance tracks
// what is actually recorded rather than a hardcoded copy that could drift.
const versionOf = (id: string): string => {
  const p = (manifest.primitives || []).find((x: any) => x.id === id)
  return p?.packaging?.npm?.packageVersion || '0.x'
}
const provenance = {
  server: 'ds4ai-mcp',
  serverVersion: SERVER_VERSION,
  suite: manifest.suite || 'DS4AI',
  bundled: {
    TEMPER: versionOf('TEMPER'), BEACON: versionOf('BEACON'), FLEET: versionOf('FLEET'),
    MISSING: 'conformance auditor',
  },
}

// Return a text result whose JSON payload carries the provenance stamp.
const out = (payload: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify({ result: payload, _provenance: provenance }, null, 2) }] })
const textOut = (text: string) => ({ content: [{ type: 'text' as const, text }] })

// WCAG relative luminance from a hex color, so check_contrast can call TEMPER's
// own contrast() (which takes luminances).
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

const server = new McpServer({ name: 'ds4ai-mcp', version: SERVER_VERSION })

// --- The headline tool: audit a shipped surface across all six axes. ---
server.tool(
  'audit_surface',
  'Audit a shipped web surface across all six invisible-correctness axes (perceivable, operable, off-happy-path, hardened, findable, fast-and-stable) with the MISSING conformance auditor. Pass a url to fetch and audit the served response, or pass html directly. Runs the breadth pass plus the depth auditors (BEACON, FLEET, and the client-surface hardening auditor) and places each axis on the internal evidence ladder (self-reported, re-provable, audited): the four machine-reachable axes reach audited on a run, while the perceivable and off-happy-path axes stay re-provable until their stated procedures are applied and passed in via `results`. The report states the breadth designation, MISSING Conformant, and whether it is earned. A fetched url also supplies the response headers the hardened header altitude needs; passing html alone leaves that altitude re-provable. It declares the axes a static check cannot judge rather than reporting them clean.',
  { url: z.string().url().optional(), html: z.string().optional(), results: z.record(z.enum(['pass', 'fail'])).optional() },
  async ({ url, html, results }) => {
    let surface: { html: string; headers?: Record<string, string | string[] | undefined>; url?: string; results?: Record<string, 'pass' | 'fail'> }
    if (html) {
      surface = { html }
    } else if (url) {
      // Fetch through the guarded Stage 1 fetcher: scheme allowlist, resolve-then-pin
      // SSRF guard, redirect re-validation, and size, time, and decompression caps. It
      // returns the body and the final response headers (the hardened header altitude
      // needs them); the body is inert data for the pure static auditors, never run.
      try {
        surface = await safeFetchSurface(url)
      } catch (e) {
        const why = e instanceof UnsafeUrlError ? e.message : (e as Error).message
        return textOut(`Could not fetch ${url}: ${why}`)
      }
    } else {
      return textOut('Provide either a url to fetch or an html string to audit.')
    }
    // The combined runner: conformance breadth over all six axes plus the depth
    // auditors, merged into one report placed on the evidence ladder. Zero-dependency
    // auditors, composition here. A caller's procedure results lift the two axes a
    // static pass cannot reach from re-provable to audited.
    if (results) surface.results = results
    return out(composedAudit(surface))
  },
)

// --- Findability (BEACON). ---
server.tool(
  'generate_head',
  'Generate the findability head tags (title, description, canonical, Open Graph, Twitter card) for a page from a flat metadata object, as an SSR/build-time string. Also returns the html lang attribute.',
  { metadata: z.object({ title: z.string().optional(), description: z.string().optional(), canonical: z.string().optional(), image: z.string().optional(), siteName: z.string().optional(), lang: z.string().optional() }).passthrough() },
  async ({ metadata }) => textOut(head(metadata) + '\n' + (htmlAttrs(metadata) ? `<!-- on <html>: ${htmlAttrs(metadata)} -->` : '')),
)
server.tool(
  'generate_jsonld',
  'Serialize one or several schema.org objects into a JSON-LD script tag, with the </script> sequence escaped. Pass a schema object or an array of them.',
  { schema: z.union([z.record(z.any()), z.array(z.record(z.any()))]) },
  async ({ schema }) => textOut(jsonLd(schema)),
)
server.tool(
  'generate_sitemap',
  'Serialize a sitemap.xml from a list of canonical URLs (strings, or objects with loc, lastmod, changefreq, priority).',
  { urls: z.array(z.union([z.string(), z.record(z.any())])) },
  async ({ urls }) => textOut(beaconSitemap(urls)),
)
server.tool(
  'generate_robots',
  'Serialize a robots.txt for crawl control. Pass allow/disallow (string or array) and one or more sitemap URLs. Index control belongs in the head robots directive, not here.',
  { options: z.object({ allow: z.any().optional(), disallow: z.any().optional(), sitemap: z.any().optional(), groups: z.any().optional() }).passthrough() },
  async ({ options }) => textOut(beaconRobots(options)),
)
server.tool(
  'audit_findability',
  'Audit a page HTML string for findability in depth (BEACON): head essentials, Open Graph, Twitter, JSON-LD validity, and the canonical-versus-og:url agreement invariant.',
  { html: z.string() },
  async ({ html }) => out(auditFindability(html)),
)

// --- Delivery (FLEET). ---
server.tool(
  'generate_image_markup',
  'Generate responsive <img> or <picture> markup with reserved dimensions and correct scheduling. Mark the LCP image priority (eager, high fetchpriority); mark offscreen images lazy. Pass avif/webp for format negotiation to get a <picture>.',
  { image: z.object({ src: z.string(), alt: z.string().optional(), width: z.union([z.number(), z.string()]).optional(), height: z.union([z.number(), z.string()]).optional(), srcset: z.string().optional(), sizes: z.string().optional(), priority: z.boolean().optional(), lazy: z.boolean().optional(), avif: z.string().optional(), webp: z.string().optional() }).passthrough() },
  async ({ image }) => textOut((image.avif || image.webp || image.sources) ? picture(image) : img(image)),
)
server.tool(
  'generate_cache_config',
  'Generate cache-header config for a named host (netlify, vercel, nginx): revalidate HTML, cache content-hashed assets for a year as immutable.',
  { target: z.enum(['netlify', 'vercel', 'nginx']), options: z.record(z.any()).optional() },
  async ({ target, options }) => textOut(cacheHeaders(target, options || {})),
)
server.tool(
  'audit_delivery',
  'Audit a page HTML string for delivery in depth (FLEET): unsized images, a lazy-loaded first image, render-blocking head scripts, and inline @font-face without font-display.',
  { html: z.string() },
  async ({ html }) => out(auditDelivery(html)),
)

// --- Perceivable (TEMPER). ---
server.tool(
  'solve_palette',
  'Solve a full TEMPER palette to verified contrast floors for a mode. mode is light, soft-light, soft-dark, or dark; notch is 0 (brighter), 1 (middle), or 2 (deeper); family is a color family key (for example iron, oxblood, moss); vision constrains for a color-vision deficiency (default, rg, by, mono). Returns the semantic token set.',
  { mode: z.enum(['light', 'soft-light', 'soft-dark', 'dark']), notch: z.number().int().min(0).max(2).optional(), family: z.string().optional(), vision: z.enum(['default', 'rg', 'by', 'mono']).optional() },
  async ({ mode, notch, family, vision }) => out(deriveByKey(mode, notch ?? 1, family ?? 'iron', vision ?? 'default')),
)
server.tool(
  'check_contrast',
  'Check the WCAG 2.1 contrast ratio between two hex colors and whether it clears the AA thresholds (4.5:1 for normal text, 3:1 for large text or non-text).',
  { foreground: z.string(), background: z.string() },
  async ({ foreground, background }) => {
    const ratio = contrast(luminance(foreground), luminance(background))
    return out({ foreground, background, ratio: Math.round(ratio * 100) / 100, passesAANormal: ratio >= 4.5, passesAALarge: ratio >= 3 })
  },
)

// --- Resources: the family manifest, agent-instruction, and standard. ---
server.resource('manifest', 'ds4ai://manifest', { mimeType: 'application/json', description: 'The DS4AI family manifest: every instrument, its axis, API, and packaging.' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: res('manifest.json') }] }))
server.resource('agents', 'ds4ai://agents', { mimeType: 'text/markdown', description: 'The DS4AI agent-instruction (AGENTS.md): compose the instruments and meet the axes.' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: res('AGENTS.md') }] }))
server.resource('standard', 'ds4ai://standard', { mimeType: 'text/markdown', description: 'The MISSING standard: the invisible-correctness layer, its axes, and the conformance procedure.' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: res('standard.md') }] }))

await server.connect(new StdioServerTransport())
