// The combined runner: run every zero-dependency family auditor on one fetch and
// merge them into a single MISSING report placed on the evidence ladder.
//
// The auditors stay standalone and dependency-free (a family baseline), so the
// composition lives here in the tool, not inside any auditor. conformance.js is the
// breadth pass over all six axes; beacon, fleet, and hardened are the depth auditors
// for their axes and are attached under each axis's `depth`. The hardened depth needs
// the response headers, which safeFetchSurface provides.
//
// conformance.js `report()` places each axis on the internal ladder (self-reported,
// re-provable, audited) and states the breadth designation, MISSING Conformant. The
// `evidence` here is that report's honest level, not a flat "audited": the four
// machine axes reach audited on a run, while the perceivable and off-happy-path axes
// stay re-provable until their procedures are applied and passed in via `results`. The
// ladder's ceiling is internal; this is never independent assessment. `ok` means no
// error finding was raised in what could be checked, not that the surface is conformant.

// The vendored auditors are untyped zero-dependency JS, so their shapes are loose here.
import { audit as auditConformance, report as reportConformance } from './vendor/conformance.js'
import { audit as auditFindability } from './vendor/beacon.js'
import { audit as auditDelivery } from './vendor/fleet.js'
import { audit as auditHardened } from './vendor/hardened.js'

export type ComposedInput = {
  html: string
  headers?: Record<string, string | string[] | undefined>
  url?: string
  // A human-applied result for an axis a static pass cannot reach (perceivable,
  // offHappyPath), lifting it from re-provable to audited.
  results?: Record<string, 'pass' | 'fail'>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any

export function composedAudit(input: ComposedInput): AnyResult {
  const { html = '', headers, url, results } = input
  const breadth: AnyResult = auditConformance(html, { url, headers })
  const ladder: AnyResult = reportConformance(html, { url, headers, results })
  const axes: AnyResult = { ...breadth.axes }

  // Attach each depth auditor's full result to its axis. The breadth entry already
  // carries the headline and a `deeper` pointer; `depth` carries the run of it.
  axes.findability = { ...axes.findability, depth: auditFindability(html) }
  axes.delivery = { ...axes.delivery, depth: auditDelivery(html) }
  axes.hardened = { ...axes.hardened, depth: auditHardened({ headers, html, url }) }

  // Merge each axis's ladder placement (rung, result, the named check, what it needs)
  // onto the axis, so one axis object carries both what was found and where it stands.
  for (const key of Object.keys(axes)) {
    const p = ladder.axes[key]
    if (p) axes[key] = { ...axes[key], rung: p.rung, result: p.result, check: p.check, needs: p.needs }
  }

  const depthResults: AnyResult[] = [axes.findability.depth, axes.delivery.depth, axes.hardened.depth]
  const depthError = depthResults.some((d) => Array.isArray(d.errors) && d.errors.length > 0)

  const result: AnyResult = {
    url: url ?? null,
    designation: ladder.designation,
    earned: ladder.earned,
    evidence: ladder.level,
    breadth: ladder.breadth,
    ok: Boolean(breadth.ok) && !depthError,
    overall: ladder.overall,
    axes,
  }
  if (breadth.truncated) result.truncated = breadth.truncated
  return result
}
