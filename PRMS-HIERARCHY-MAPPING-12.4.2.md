# PRMS Hierarchy Mapping — 12.4.2

The PRMS connector now follows the established PRMS Gantt loading contract:

1. Fetch `EventsHierarchy/{projectId}`.
2. Fetch `ActionHierarchybyProject/{projectId}`.
3. Normalize Events and Actions into one Schedule Intelligence task collection.
4. Event IDs become `E{E_ID}`.
5. Action IDs become `A{ID_Action}`.
6. Event `E_ID_Dependance` / `ParentKey` becomes `parentId = E{parent}`.
7. Action `E_Id` / `ParentKey` becomes `parentId = E{parent}`.
8. `parentId` represents hierarchy only; it is not converted into a scheduling dependency.
9. Expected dates remain the editable schedule dates.
10. Actual dates remain source-owned/read-only; an absent actual end is treated as ongoing for the Gantt view.
11. Missing expected end falls back to a seven-day window from expected/actual start, matching the established PRMS C# behavior.
12. Events and Actions are merged before persistence and are exposed to the Gantt as one unified task set.

The Gantt therefore consumes a provider-neutral hierarchy:

```text
E100
├── E101
│   ├── A501
│   └── A502
└── A503
```

No dependency records are created from `ParentKey`.
