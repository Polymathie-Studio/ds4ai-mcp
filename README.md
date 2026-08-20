# DS4AI MCP server

The aggregate endpoint of **DS4AI, the Design Suite for AI, from [Polymathie-Studio](https://github.com/Polymathie-Studio)**. It serves the suite as callable MCP tools, so a person working with an AI reaches the conformance auditor and the generators through their agent, without calling a function. Unlike the `@proof-of-coord` standards servers, which point at canonical source, this server *runs* the primitives, and because it is a process rather than a browser it can fetch a URL and audit the served HTML.

## Run it

No build step, no global install, the way the other servers run:

```
deno run -A jsr:@polymathie/ds4ai
```

Or from npm: `npx @polymathie/ds4ai`. It speaks MCP over stdio.

Add it to an MCP client (Claude Code, Cursor, and the rest) as a stdio server whose command is `deno` with arguments `run -A jsr:@polymathie/ds4ai`.

## Tools

- **audit_surface** `{ url? , html? }`: audit a shipped surface across all six invisible-correctness axes with the MISSING conformance auditor. Give a URL and it fetches and audits the served HTML. Declares the axes a static check cannot judge rather than reporting them clean.
- **generate_head**, **generate_jsonld**, **generate_sitemap**, **generate_robots**, **audit_findability** (BEACON): findability head tags, JSON-LD, sitemap, robots.txt, and the depth findability audit.
- **generate_image_markup**, **generate_cache_config**, **audit_delivery** (FLEET): responsive image and picture markup, cache-header config per host, and the depth delivery audit.
- **solve_palette**, **check_contrast** (TEMPER): solve a full palette to contrast floors for a mode, and check the WCAG contrast between two colors.

Every result carries a provenance stamp declaring the server and bundled primitive versions.

## Resources

- `ds4ai://manifest`: the DS4AI family manifest (read generically, so it tracks the manifest as its data source).
- `ds4ai://agents`: the agent-instruction (AGENTS.md), so a connected agent gets the compose-the-suite instruction for free.
- `ds4ai://standard`: the MISSING standard.

## How it is built

TypeScript on the MCP SDK with zod schemas, provenance-stamped, following the `@proof-of-coord` pattern. The zero-dependency primitives (TEMPER, BEACON, FLEET, and the MISSING conformance auditor) are bundled in, so the server is self-contained, and each tool stamps the primitive version it bundled. Published to JSR under `@polymathie`, with an npm `bin` alongside.

## Part of DS4AI

DS4AI, the Design Suite for AI, from Polymathie-Studio, joins PT4AI and PC4AI in the family of corpora served to an AI. The instruments and the MISSING standard live at [Polymathie-Studio](https://github.com/Polymathie-Studio).

## License

Apache-2.0. Copyright 2026 Regis Lloyd Chapman. See `LICENSE` and `NOTICE`.
