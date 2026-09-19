# Schedule Intelligence v11.3.6 — Dependency Link Feedback

## Fixed
The Apply Link action could appear to do nothing when the dependency was invalid or rejected.

## Changes
- Dependency Composer now validates missing predecessor/successor, self-links, and invalid lag before submission.
- Apply button shows an Applying… state while the API request is in progress.
- API failures remain visible inside the composer instead of silently closing it.
- Duplicate dependency responses are shown with actionable guidance.
- Cycle errors are returned with a readable dependency-cycle explanation when task names are available.
- Existing dependency integrity rules remain enforced server-side.
