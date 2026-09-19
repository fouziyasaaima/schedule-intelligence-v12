# Schedule Intelligence 15.0.1 — Resource Orbit Project Scope & UX Fix

## Fixed

### 1. Resource Orbit now keeps the selected project as the source of truth
- Resource Orbit receives the active project ID directly from the Gantt workspace.
- The Add Resource action writes the new resource with that project ID.
- Project resource listing now uses project membership (`project_resources`) and task assignments as the scope.
- Removed the connector-wide resource filter that incorrectly hid locally-created resources from connector-backed/PRMS projects.
- Imported PRMS resources remain visible when they are actually assigned/linked to the selected project.
- Resources belonging to other projects are not pulled into the selected project's Orbit.

### 2. Add Resource form is self-explanatory
Every input now has an explicit label:
- Resource name
- Resource type
- Role / purpose
- Capacity — hours/day
- Available units
- Unit label
- Availability — percent

The form also shows the selected project and explicitly says that the new resource will be scoped to that project.

### 3. Better capacity configuration
Availability percentage is now captured in the form and sent to the API. This supports people, equipment, vehicles, facilities, teams and other capacity resources without relying on ambiguous placeholders.

## Expected behavior

If the Gantt is open on `PRMS · Project 5527` and the project currently has 3 resources:

1. Click **Add resource**.
2. Enter the resource details.
3. Click **Add to project**.
4. The API creates the resource and its `project_resources` membership.
5. Resource Orbit reloads using Project 5527 as the scope.
6. The resource count changes from 3 to 4 and the new resource appears in Orbit/Timeline/Impact.
7. Switching to another project does not show the newly-created resource unless it is also explicitly linked/assigned there.

## Validation

The source was checked with TypeScript parser/compiler invocation. Full dependency-backed builds require the project `node_modules` packages, which are not included in the source archive used for this patch.
