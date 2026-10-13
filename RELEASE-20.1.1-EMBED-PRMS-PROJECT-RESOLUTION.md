# Schedule Intelligence 20.1.1 — Embedded PRMS Project Resolution

## Fix

Embedded session creation now resolves a PRMS external project ID to the canonical Schedule Intelligence project through the existing PRMS connector identity mapping.

### Supported inputs

- Existing SI project IDs continue to work unchanged.
- PRMS hosts may send `projectSource: "prms"` with the PRMS project ID.
- Older PRMS host integrations that send only the PRMS project ID are supported through a backward-compatible PRMS mapping fallback.

### Resolution

```text
PRMS project ID
      ↓
connector identity: project / PRMS:<projectId>
      ↓
SI internal project ID
      ↓
organization check
      ↓
short-lived embedded session
```

The long-lived SI API key remains server-side. The generated embed token remains scoped to the resolved SI project.

### Important

The PRMS project must already be synchronized through the configured PRMS connector so the `connector_identities` mapping exists. The endpoint does not silently create or synchronize external projects while minting an embed token.
