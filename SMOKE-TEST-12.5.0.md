# v12.5.0 Smoke Test

1. `docker compose build --no-cache api ui`
2. Start services and verify API `/health` and `/ready` report 12.5.0.
3. Open an imported PRMS project.
4. Confirm Events and Actions are merged into one Gantt tree.
5. Confirm PRMS IDs (`E####`, `A####`) are visible in task rows and timeline bars.
6. Expand a parent with children; verify every descendant appears in the same hierarchy order.
7. Collapse the parent; verify all descendants disappear from both sidebar and timeline.
8. Open Network; verify parent/child structure is visible and scheduling dependencies remain separate arrowed links.
9. Change a child expected end; verify parent and all ancestors extend to the latest descendant end.
10. Confirm Event `E_Leader` creates/uses a resource identity and displays the SI Resource master name when linked.
11. Confirm Action `ID_Member` creates/uses a resource identity and `AssignedTo` is only a fallback display name.
12. In MAC Studio, enable autonomous scheduling + dependency/date application.
13. Open/import a project and confirm MAC runs once after import when explicitly enabled.
14. Verify the MAC run reports proposals, applied changes, cost and confidence.
15. Verify a cycle proposal is rejected and the run rolls back safely.
16. Verify actual dates are unchanged by MAC.
17. Verify the latest applied MAC run can be rolled back.
18. Verify `.env` and credentials are not staged in Git.
