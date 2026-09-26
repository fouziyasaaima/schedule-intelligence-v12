# Schedule Intelligence v17.4.1 — Fixed Functional Scheduling

## Build fixes
- Fixed `components/ResourceOrbit.tsx`: imported `Zap` from `lucide-react`.
- Fixed the Autoprefixer warning in `globals.css` by replacing `align-items:end` with `align-items:flex-end`.
- Bumped UI/API/package/compose version metadata from 17.4.0 to 17.4.1.

## Functional scheduling
- Scheduling cockpit remains enabled.
- MAC scheduling actions remain enabled.
- Schedule Work flow remains enabled.
- Large-dataset scheduling mode remains enabled.

## Build
Run from the project root:

```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
```

Note: production Docker build should be the final verification because dependencies are installed inside the Docker build.
