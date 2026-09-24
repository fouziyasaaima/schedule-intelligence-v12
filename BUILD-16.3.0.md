# Build 16.3.0

## Docker

```powershell
docker compose build --no-cache
docker compose up -d
```

If an old Schedule Intelligence stack is using ports 3000/4000/8025, stop it before starting this release.

## Local validation

```powershell
cd api/orbital-gantt-api
npm install
npm run build

cd ../../ui/orbital-gantt-ui
npm install
npm run build
```

The source package includes the import endpoint and Import Center. Dependency installation could not be completed in the build environment used to package this release because npm installation timed out; therefore a clean production compile should be performed on the target machine.
