# Schedule Intelligence v14.1.1 — Project-Scoped Intelligence + MAC Answers + Reliable Print

## Fixes
- Intelligence → Resource Pressure now returns only resources assigned to the selected project.
- MAC question responses now include a direct, evidence-grounded `answer` field and render it prominently.
- MAC explicitly states when supplied evidence is insufficient instead of guessing.
- Print Report now opens a generated HTML document through a Blob URL and prints after load, avoiding the blank-window behavior.
- Existing CSV, Excel, PDF + Gantt and JSON exports remain unchanged.

## Security / cost
- Existing minimized MAC context and server-side API keys are retained.
- No connector credentials are included in exports.
- No additional model call is introduced for the new answer card.
