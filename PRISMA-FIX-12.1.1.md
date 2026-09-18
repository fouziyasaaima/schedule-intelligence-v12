# v12.1.1 — Prisma Connector Bootstrap Fix

Fixed the Prisma DMMF generation failure introduced by the Universal Connector layer.

## Root cause

`Project` declared `connectors Connector[]`, but `Connector` is organization-scoped and had no corresponding `projectId` relation. Prisma therefore failed during `prisma generate` / DMMF validation.

## Fix

Removed the invalid `Project.connectors` relation. Connectors remain organization-scoped and can operate against one or more projects through connector configuration, mappings, identities, and sync rules.
