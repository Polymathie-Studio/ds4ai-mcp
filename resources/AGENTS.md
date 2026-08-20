# Polymathie: instructions for an AI building web surfaces

This is the Polymathie family's agent-instruction file. It ships as `AGENTS.md`, and the same content serves as a `CLAUDE.md`, a Cursor rules file, or a Windsurf rules file. All seven instruments it names are published at github.com/Polymathie-Studio.

You are building a website, a dashboard, a documentation surface, or a small AI tool. You are good at the visible first draft: layout, flow, presentation. The failures that reach real users live in the invisible layer, the part a look-at-it review cannot see: the state no one triggered, the keyboard no one used, the metadata no crawler read, the error no one hit, the key left in the bundle. This file is how you close that layer. Compose the Polymathie instruments below instead of hand-rolling their concerns, and meet every axis in the checklist.

## Use these instruments, do not reinvent them

**TEMPER** (`temper`, design tokens and color). Read semantic tokens for every color, and for spacing, type, radius, and borders. Never hardcode a hex, a gap value, or a font weight; drift across components is the most-cited AI-build miss, and tokens prevent it. Contrast floors and non-color-alone encoding are on by default; do not defeat them. Set a mode on the root element and every component follows.

**LUCID** (`lucid-reader`, disclosure) and **GRACE** (`grace-states`, the state components). For dense content, mark a term once with LUCID and let the reader open it at depth rather than dumping everything or hiding what they need. And never ship the happy path only: use GRACE for the states LUCID's principle requires. Every list has an empty state that says why it is empty and what to do next; every fetch has a loading state (a skeleton, not a bare spinner); every failure has an error state in plain language with a way back; and there is a real 404. A form that submits must show success or failure, never fail silently.

**HASP** (`hasp-key`, keys and secrets). If the tool calls an AI model, the user brings their own key. Never put an API key or secret in the client bundle. Hold the key in the browser with HASP, never on a server, and let the charges land on the user's own account.

**GRASP** (`grasp-ui`, operability). Use its components rather than hand-rolling controls: a button is a `button`, not a `div` with an onClick; fields wire their own labels and errors; the modal traps and returns focus; the menu, tabs, combobox, and the rest are keyboard-operable and carry the right roles. Where you write your own control, match what GRASP does: keyboard-operable, a visible focus indicator, a name and role for assistive technology, and a label on every input.

**BEACON** (`beacon-ui`, findability). Generate the head with BEACON at server-render or build time, never by client-side injection, because the social and AI scrapers that read your page do not run JavaScript. It emits the title, description, canonical, Open Graph and Twitter cards, and JSON-LD, and serializes the sitemap, robots.txt, and favicon set. Put real content in the initial HTML, not an empty div a crawler cannot read.

**FLEET** (`fleet-ui`, delivery). Emit images with FLEET so every one has an explicit width and height to stop layout shift, the LCP image is eager and high-priority while off-screen images are lazy, and formats are negotiated. Use its resource-hint and font head tags and its cache-header config. FLEET emits the markup and config; your build still has to produce the optimized images and bundles it points at.

## Re-run this on every deploy

A redeploy can reintroduce any of these, so treat it as a checklist you run each time you ship, not once. The MISSING conformance auditor runs it for you against a shipped surface:

- States: loading, empty, error, offline, and 404 all exist and read in plain language.
- Operable: the keyboard reaches and works every control; focus is visible and managed; inputs are labeled.
- Perceivable: contrast meets the floor; meaning is never carried by color alone.
- Findable: title, description, canonical, Open Graph image, structured data, favicon, sitemap, robots; real content in the first HTML.
- Fast and stable: images dimensioned and scheduled; bundle lean; no layout shift; analytics deferred.
- Key-safe: no secret in the client bundle.

## What is yours, not the toolkit's

These are real, and you must handle them, but no instrument closes them for you. Do not pretend they are done.

- Observability: error tracking, analytics that actually fire, uptime and performance monitoring. Nothing watching a site is how failures go unnoticed for days.
- Backend security and scale: row-level security, auth-token refresh, rate limits, avoiding N+1 queries, secrets kept server-side.
- Delivery transforms and enforcement: image compression, JavaScript bundling, and setting cache headers or CDN behavior are build-tool and server work. FLEET emits the markup and config that point at the built assets; producing them is yours.
- Responsive layout: a discipline, not a component. Test real breakpoints, not only the width you designed at.
- Cross-browser: test in Chromium, Firefox, and WebKit; they differ.
- Legal content: a privacy policy, and any consent your jurisdiction requires.

Do not present a surface as done because it looks done. Done is when the invisible layer is there too.
