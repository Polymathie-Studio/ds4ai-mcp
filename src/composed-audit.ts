// The combined runner: run every zero-dependency family auditor on one fetch and
// merge them into a single MISSING report.
//
// The auditors stay standalone and dependency-free (a family baseline), so the
// composition lives here in the tool, not inside any auditor. conformance.js is the
// breadth pass over all six axes; beacon, fleet, and hardened are the depth auditors
// for their axes and are attached under each axis's `depth`. The hardened depth needs
// the response headers, which safeFetchSurface provides.
//
// Evidence level is "audited": this tool applied a defined, repeatable check. That is
// the internal ceiling of the assurance ladder (self-reported, re-provable, audited);
// it is not independent assessment, and `ok` means no error finding was raised in what
// could be checked, not that the surface is fully conformant. The axes that a static
// pass cannot judge are declared, not reported clean.

// The vendored auditors are untyped zero-dependency JS, so their shapes are loose here.
import { audit as auditConformance } from './vendor/conformance.js'
import { audit as auditFindability } from './vendor/beacon.js'
import { audit as auditDelivery } from './vendor/fleet.js'
import { audit as auditHardened } from './vendor/hardened.js'

export type ComposedInput = {
  html: string
  headers?: Record<string, string | string[] | undefined>
  url?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any

export function composedAudit(input: ComposedInput): AnyResult {
  const { html = '', headers, url } = input
  const breadth: AnyResult = auditConformance(html, { url, headers })
  const axes: AnyResult = { ...breadth.axes }

  // Attach each depth auditor's full result to its axis. The breadth entry already
  // carries the headline and a `deeper` pointer; `depth` carries the run of it.
  axes.findability = { ...axes.findability, depth: auditFindability(html) }
  axes.delivery = { ...axes.delivery, depth: auditDelivery(html) }
  axes.hardened = { ...axes.hardened, depth: auditHardened({ headers, html, url }) }

  const depthResults: AnyResult[] = [axes.findability.depth, axes.delivery.depth, axes.hardened.depth]
  const depthError = depthResults.some((d) => Array.isArray(d.errors) && d.errors.length > 0)

  const result: AnyResult = {
    url: url ?? null,
    evidence: 'audited',
    ok: Boolean(breadth.ok) && !depthError,
    axes,
  }
  if (breadth.truncated) result.truncated = breadth.truncated
  return result
}
