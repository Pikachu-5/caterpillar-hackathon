# Technology and dependency policy

| Area | Selected baseline | Why |
| --- | --- | --- |
| JavaScript | Node 22.14+ (22.x), npm workspaces, TypeScript 5 | Portable; one lockfile |
| Dashboard | React 19, Vite 7, Tailwind CSS 4, Recharts 3 | Operator UI and charts |
| Site map | Leaflet 1.9 with CRS.Simple; plain Leaflet adapter | Local meter coordinates, no paid map tiles |
| Simulator | Phaser 3.90 with TypeScript/Vite 7 | Mature 2D engine; do not silently upgrade to a different major |
| Backend | Python 3.12, FastAPI/Pydantic 2, Uvicorn | One modular server with REST/WebSockets |
| Persistence | PostgreSQL 17, SQLAlchemy 2, Alembic, psycopg 3 | Accounts/history and transactional progress |
| Authentication | pwdlib Argon2 + opaque database sessions | Revocable sessions; no extra auth SaaS |
| Data/ML | pandas, NumPy, scikit-learn | Reproducible synthetic generation, regression/anomaly baselines |
| Document retrieval | pypdf + page-aware chunks + scikit-learn TF-IDF | No vector service or local LLM needed |
| Answer generation | google-genai; configurable Gemini model | Optional server-side API, small configurable budget |
| Weather | Open-Meteo forecast/current API | Noncommercial demo use; attribution required |
| Voice | Deferred; no chosen runtime/dependencies | Core deliverables first |
| Scaffold tooling | AJV 2020, ajv-formats, json-schema-to-typescript | Shared schema checks and TS declarations |

These are selected compatible major lines, not a claim that each is the newest release. Exact runtime versions and lockfiles are resolved by the first implementation ticket for that workstream. Root package-lock.json locks the actual scaffold tools. Python pyproject constraints avoid conflicting major upgrades; the backend owner will create uv.lock before its first runtime change.

Do not install the entire runtime stack merely to validate this scaffold. No Docker application images, GPU dependencies or paid services are required by Phase 0. shadcn/ui components may be added when needed; do not generate a large unused component library.

## Provider configuration

GEMINI_MODEL remains blank until a model available to the user's API key is selected. A missing key/model disables remote answers with an explicit “not configured” state. It must not produce fake answers. Implement request/token caps, a configurable application spending ceiling and usage logging in AI-001; do not promise hard dollar enforcement without provider pricing/usage reconciliation. Embeddings are not needed for the initial TF-IDF retrieval.

Official references checked for the scaffold:

- [Vite runtime requirements](https://vite.dev/guide/)
- [Google's current GenAI SDK](https://ai.google.dev/gemini-api/docs/libraries)
- [Open-Meteo API variables, units and time](https://open-meteo.com/en/docs)
- [Open-Meteo terms](https://open-meteo.com/en/terms)

Open-Meteo data is modeled weather, not a sensor at the excavator. Live soil moisture is not assumed: v1 soil type/moisture remain explicit site/demo inputs with separate provenance. No precipitation-to-soil conversion is claimed as observed reality.
