# MISSING: the invisible-correctness layer of a shipped web surface

A standard for what a built web surface must carry that a look-at-it review cannot see. Version 0.1.0. Dual-licensed: the specification text under CC-BY-4.0 (see `LICENSE-SPEC`), the reference tooling under Apache-2.0.

## Abstract

A web surface can render correctly, demo cleanly, and pass a visual review while failing the users it reaches, because the failures live where a look-at-it review cannot see: the state no one triggered, the keyboard no one used, the metadata no crawler read, the key left in the bundle, the image that arrives late and shifts the page. This standard names that invisible-correctness layer, states the posture each axis of it must hold, routes each axis to a reference instrument that closes it, provides a conformance procedure, and marks honestly the concerns no drop-in instrument can close. It exists because fast, increasingly AI-assisted building is good at the visible first draft and reliably drops the invisible layer, and because that layer is checkable.

## The stance: present, and honest

The standard takes one posture above the axes, and like a well-formed design it is bounded from both sides, naming what it must not fall below and what it must not exceed.

On the surface, the floor is that the invisible layer is present: a conforming surface holds all six postures, not only the visible first draft, because looks-done is exactly the state that fails the users a review never reaches. The ceiling is that no surface is asked to carry what no drop-in instrument can close: the concerns named out of scope are the operator's, and demanding them for conformance would make the standard an unmeetable mandate rather than a checkable floor.

On the standard's grip on itself, the floor is that it names every axis of the invisible layer it can and routes each, and its check verifies what it can on every deploy rather than once. The ceiling is that the standard and its check claim only what they actually close and declare the rest: the unverifiable is never reported clean, and partial coverage is never presented as full. Cross that ceiling and MISSING becomes the overclaiming artifact it exists to prevent.

Present, and honest about the edge of presence. That pair is the whole stance.

## 1. The invisible-correctness layer

A builder, human or AI, optimizes for what the artifact under review shows: does it render, does the demo work. Everything not visible in that artifact is at risk of being skipped. The invisible-correctness layer is the set of properties a shipped surface must have that a visual review does not exercise. This is a frame, not a catalog: each axis below is a configuration of the one thing, what a demo-review cannot see, which is why a single standard can hold them rather than a list of unrelated fixes.

## 2. The axes and their postures

A conforming surface holds all six postures. Each is stated normatively; each is verifiable, with the limits noted in the conformance procedure.

1. **Perceivable.** Every reader can perceive the content. Color contrast meets the WCAG floor, and no meaning is carried by color alone. Text remains legible and resizable.
2. **Operable.** Every control is operable by any input and any assistive technology. Controls are semantic elements or carry the correct role; each is keyboard-operable with a visible focus indicator and an accessible name; focus is managed across overlays and returned on close; every input is labeled.
3. **Honest off the happy path.** The surface discloses its condition rather than failing silently. Loading, empty, error, offline, and not-found states each exist and read in plain language, with a way forward. A submission reports success or failure.
4. **Key-private.** Where the surface calls a model or service on the user's behalf, the user's key stays in the user's browser and never reaches a server the operator controls.
5. **Findable.** The surface represents itself correctly to search engines, social platforms, and machine agents. The identifying metadata, canonical URL, social cards, structured data, and the site-level files are present in the server-returned HTML, where consumers that do not run JavaScript can read them.
6. **Fast and stable.** The surface loads quickly and does not shift under the reader. Images reserve their space and are scheduled correctly, the critical path is clear, and repeat visits are cached.

## 3. Routing: each axis to its instrument

The standard is accompanied by a reference family, [Polymathie](https://github.com/Polymathie-Studio), where each instrument closes one axis. A surface may meet an axis by any means; the instruments are the reference way.

| Axis | Posture | Reference instrument |
| --- | --- | --- |
| Perceivable | Perceivable by any reader | TEMPER (color and design tokens) |
| Operable | Operable by any input or assistive technology | GRASP (interaction components) |
| Honest off the happy path | Discloses its condition | LUCID (the disclosure principle) and GRACE (the state components) |
| Key-private | The key stays in the browser | HASP |
| Findable | Represents itself to machines and shares | BEACON |
| Fast and stable | Loads fast and stable | FLEET (the primitizable slice) |

The instruments are zero-dependency, native-first, and themed by TEMPER; the family manifest (`manifest.json`) is the machine-readable descriptor of them.

## 4. Conformance

Conformance is a property of the surface: it is conformant when it holds all six postures. The reference conformance auditor (`conformance.js`) is one instrument for checking that property, and it is partial by nature, because not every posture can be verified from a served-HTML snapshot. It states what it did not check rather than reporting it clean, which is itself a requirement of this standard: an auditor that reports the unverifiable as clean is the overclaiming the standard exists to prevent.

The postures divide by what a static check can reach:

- **Fully checkable from served HTML**: findability and delivery (the auditor composes BEACON's and FLEET's own auditors for depth), and the operable and key-private axes at the level of semantic controls, labeled inputs, and exposed secrets.
- **Partially checkable**: the perceivable axis. Contrast needs resolved colors, so it is verified against the palette with TEMPER's `contrast`, not from a snapshot.
- **Not statically checkable**: the honest-off-the-happy-path axis. The loading, empty, error, and not-found states are not visible in a single happy-path render; they are verified by driving the surface into each state.

From that reach come two tiers, and they are a distinction between machine-proved and human-confirmed, never between easy axes and hard ones:

- **Audited**: the surface passes every check the auditor can make from served HTML. This is machine-verifiable and belongs on every deploy, in continuous integration, since a redeploy can reintroduce any miss.
- **Conformant**: audited, plus the manual verification of the axes the auditor declares out of reach, the off-happy-path states driven into each condition and contrast checked against the palette. Conformant means all six postures hold; it is the full bar.

Audited is the honest intermediate a pipeline reports on its own, not a substitute for conformant: a surface is not done because it is audited, only when the invisible layer is confirmed present including the parts a snapshot cannot see. A surface passes an axis when its findings contain no error; an axis the auditor marks partial or not-checked is declared, never counted as clean.

## 5. Out of scope: honestly not closed

The standard names these as real concerns and routes them to the operator, never claiming coverage. Marking them is a requirement, because leaving them unmarked would make the standard the overclaiming artifact it exists to prevent.

- **Observability**: error tracking, analytics that fire, uptime and performance monitoring. Not a client-side property.
- **Backend security and scale**: row-level security, token refresh, rate limits, query efficiency, secrets kept server-side. Out of a frontend standard's reach.
- **Delivery transforms and enforcement**: image compression, JavaScript bundling, and setting cache headers or CDN behavior are build-tool and server work. A drop-in instrument emits the markup and config that point at the built assets and audits the result; it cannot perform the transform or the enforcement.
- **Responsive layout**: a design-specific discipline, not a component. The standard states the requirement and provides no primitive.
- **Cross-browser** differences and **internationalization**: disciplines the operator tests.
- **Legal content**: privacy policy and jurisdictional consent, content-specific.

## 6. Using the standard

Three artifacts carry it. The **agent-instruction file** (`AGENTS.md`) tells an AI builder to compose the instruments and meet the axes rather than hand-rolling. The **manifest** (`manifest.json`, validated by `manifest.schema.json`) is the machine-readable descriptor an agent or pipeline reads. The **conformance auditor** (`conformance.js`) is the runnable check. A builder composes the instruments, an agent reads the manifest and follows the agent-instruction, and every deploy runs the auditor.

A surface is not done because it looks done. It is done when the invisible layer is there too.

## 7. Where it stands against prior work

The axes are not invented here; each is anchored in an established frame, and the standard cites them rather than claiming them. Perceivability and operability are WCAG and the WAI-ARIA Authoring Practices; findability is the Open Graph protocol, schema.org, the Sitemaps protocol, and RFC 9309; delivery is the Core Web Vitals. The miss-frequency evidence that sets what matters most is the public record of what fast builds break: crawl datasets, accessibility audits, and web-performance field data.

MISSING does not replace any of these; it composes them. WCAG splits accessibility into four principles, perceivable, operable, understandable, and robust, and those are met across TEMPER, GRASP, and LUCID; MISSING does not restate WCAG, it routes to the instruments that hold it. What the standard holds as its own is the assembly: naming the whole invisible-correctness layer as one frame rather than a list of unrelated fixes, routing each axis to an instrument, and providing a conformance procedure honest about its own reach. The contribution is the whole standing together, not a new requirement inside it.

## License

The specification text (this document) is licensed CC-BY-4.0; see `LICENSE-SPEC`. The reference tooling in this repository is licensed Apache-2.0; see `LICENSE`.
