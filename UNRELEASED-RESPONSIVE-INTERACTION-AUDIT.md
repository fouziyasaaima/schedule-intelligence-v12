# Unreleased Responsive & Interaction Audit

This working build is intentionally **not a release**. It addresses the application-wide responsive/interaction issues found during mobile review.

## Fixed
- Mobile expanded navigation now restores rail labels, descriptions, keyboard hints, secure status and footer copy instead of inheriting the legacy compact-rail hide rule.
- Intelligence forecast action is a real button and opens the Monte Carlo Forecast form.
- Intelligence resource-pressure rows are interactive. Selecting one opens Resource Orbit and focuses the selected resource.
- Mobile Gantt is constrained to the viewport while retaining an internally scrollable timeline canvas.
- Primary views and overlays receive cross-device min/max width containment.
- Network, Pulse, Resource Orbit, Forecast, Impact, Recovery, composers and Intelligence receive additional narrow-viewport containment and wrapping rules.
- Touch targets retain usable minimum sizing.
- Existing light/dark theme parity fixes remain in place.

## Interaction contract
- Intelligence -> Forecast: opens the Forecast form.
- Intelligence -> Resource: opens Resource Orbit focused on that resource.
- Intelligence -> Task hotspot: returns to Schedule with the task selected.
- Rail expanded on mobile: labels remain visible.

## Validation note
A full Next.js build requires the package dependencies (`node_modules`), which are intentionally not shipped in the source package. Static source checks were performed; the working package should be browser-tested at 1920, 1440, 1366, 1024, 768, 430, 414, 390 and 375px in both themes before assigning a release version.


## v12.0.4 resolution
Gantt vertical synchronization was hardened with guarded scroll propagation and deterministic keyboard navigation.
