# v11.2.4 — Viewport Integrity Release Hardening

This release consolidates the final viewport and interaction corrections requested during UI validation.

## Application shell
- Primary workspace views now stay inside the normal `.orbital-main` flow.
- Legacy browser-viewport positioning and rail-specific left offsets are neutralized for Network, Pulse and Resources.
- Active views cannot create a phantom second grid row or overlap the application topbar/navigation rail.

## Network
- Network is a content view, not a browser-level overlay.
- Graph is fitted to the available canvas on initial render.
- Zoom changes the graph world/node scale, not the application shell.
- Nodes are clamped to graph bounds during drag.
- Close control is always visible in the Network header.
- Existing create/link/drag/delete dependency interactions remain available.

## Pulse
- Pulse remains inside the main content viewport.
- Header and close control stay within the active workspace.
- Dashboard can scroll internally when the viewport is too small instead of escaping the shell.

## Resources
- Resource Orbit remains inside the active workspace.
- Resource detail is contained within the Orbit surface rather than anchoring to the browser viewport.
- Header/actions wrap without leaving the application viewport.
- Orbit visualization remains responsive to its measured container.

## Command palette
- Added a clear X close button matching other application windows.
- Escape remains a secondary keyboard shortcut only.

## Validation
- Changed UI TypeScript/TSX files were syntax checked with TypeScript transpilation.
- Package JSON files parse successfully.
- Docker Engine was not available in the build environment; final Docker image compilation must be verified on the target Docker host.
