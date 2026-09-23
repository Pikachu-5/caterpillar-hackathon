# Multi-agent Git workflow

One repository, independent feature branches/checkouts, explicit directory ownership. This scaffold does not launch agents or create GitHub issues automatically.

1. Read root.md and select a ready backlog ticket with its dependency conditions.
2. Branch from current main, e.g. feature/BE-001-foundation or feature/SIM-001-world. Pull the latest shared contracts before starting.
3. Assign one role and a narrow scope. Your friend may own both backend and dashboard; do not assume two agents can simultaneously edit those same files safely.
4. Implement only acceptance criteria for that issue, validate, and open a focused PR. Use actual GitHub issue numbers for “Closes #123”; BE-001 is a local key, not a GitHub ID.
5. A contract change gets its own coordinated issue/PR with before/after payloads, affected workstreams, version bump, regenerated declarations, updated fixtures and migration plan. Do not make silent schema edits from a feature branch.
6. Root lockfiles/configuration are shared. Coordinate one integration owner for concurrent dependency changes; never discard another workstream's lockfile additions during conflict resolution.
7. Integrate small vertical slices early against fixtures and the backend demo publisher. Do not wait until all subsystems are “finished” to discover incompatibility. Optional integration branches are temporary testing branches, not a second source of truth.

The issue templates and PR template live in .github/. CODEOWNERS is intentionally absent until real GitHub usernames/teams are supplied; role names cannot function as GitHub reviewers. Add branch protection through repository settings when collaborators and review expectations are known; a markdown rule alone does not enforce access boundaries.

Suggested prompts are in root.md. New chats must inspect current code/status instead of assuming the Phase 0 state never changed.
