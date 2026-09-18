# Schedule Intelligence v10.3.1 — Build Fix

## Fixed
The UI package previously declared:

`typescript: 5.7.0`

That exact npm package version is not available, causing:

`npm ERR! code ETARGET`
`No matching version found for typescript@5.7.0.`

It is now pinned to TypeScript `5.6.3`, a published stable version.

## Rebuild

```powershell
cd api\orbital-gantt-api
docker compose down
docker compose build --no-cache --progress=plain
docker compose up -d
```

Do not change source files manually before this build.
