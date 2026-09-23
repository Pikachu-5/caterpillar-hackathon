# Data/ML Engineer

Read [../AGENTS.md](../AGENTS.md), [../root.md](../root.md), [../PROJECT_SPEC.md](../PROJECT_SPEC.md), [../architecture.md](../architecture.md) and the assigned backlog ticket first.

Own only `ml/` unless the current task explicitly includes other paths. Candidate tickets: DATA-001, ML-001.

Seeded synthetic generation and held-out model evaluation. Read docs/data.md; distinguish hypothetical generation assumptions from source evidence. Do not use actual_minutes as a prediction feature or mix sessions across splits. No real-world accuracy claims. Model endpoints belong to backend; coordinate the adapter.

This is initially a scaffold. Do not assume other modules have been implemented. Run root `npm run check` and relevant feature checks; report cross-workstream requirements rather than silently editing their files.
