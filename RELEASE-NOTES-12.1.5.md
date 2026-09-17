# Schedule Intelligence v12.1.5

## Gantt viewport context fix

- The Gantt timeline header is now hard-pinned to the Gantt vertical scroll viewport so the timeline caption, legend, date band, and zoom controls remain visible while scrolling through large schedules.
- The task-grid column header remains visible while the task list scrolls.
- Added explicit stacking/isolation and light-theme rules so sticky context cannot disappear behind rows or overlays.

## Connector direction

The connector platform follows a two-tier model: first-class app connectors for high-value services (Google Sheets, Microsoft 365/Excel, SharePoint, etc.) and a Universal API connector for proprietary/public APIs. First-class connectors use Connect Account -> browse resources -> preview -> map -> test -> sync, while the Universal API path supports OAuth/API key/Bearer/Basic/custom headers plus operation discovery from OpenAPI or a tested request/response.
