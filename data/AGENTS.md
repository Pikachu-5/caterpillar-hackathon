# Data/ML Engineer

Read [../AGENTS.md](../AGENTS.md), [../root.md](../root.md), [../PROJECT_SPEC.md](../PROJECT_SPEC.md), [../architecture.md](../architecture.md) and the assigned backlog ticket first.

Own only `data/` unless the current task explicitly includes other paths. Candidate tickets: DATA-001.

Preserve reference CSVs exactly. Generated records retain original field semantics and permitted categories, with explicit environmental extensions and provenance. No invented source timezone/window or cross-table linkage. Generated output is not an excuse to modify supplied records.

This is initially a scaffold. Do not assume other modules have been implemented. Run root `npm run check` and relevant feature checks; report cross-workstream requirements rather than silently editing their files.
