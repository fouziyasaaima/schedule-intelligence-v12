# Build 16.2.0

## API
```powershell
cd api/orbital-gantt-api
npm install
npm run build
```

## UI
```powershell
cd ui/orbital-gantt-ui
npm install
npm run build
```

## Docker
From the release root:
```powershell
docker compose build --no-cache

docker compose up -d
```

## PRMS prerequisites
The existing PRMS connector authentication must be configured. The connector must be able to call:
- `/api/prms/ListUsers`
- `/api/prms/saveevents`
- `/api/event/rebuildstructure`

The publish workflow uses the configured PRMS connector base URL and existing token acquisition flow.
