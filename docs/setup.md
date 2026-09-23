# Setup and portability

Phase 0 only supports scaffold validation and optional PostgreSQL startup. Do not expect an app to launch.

## Prerequisites

- Git; Node 22.14+ within 22.x with npm 10+.
- Python 3.12 and uv for future backend/ML implementation.
- Optional Docker Compose v2 or a native PostgreSQL 17 installation.

macOS Apple Silicon and Windows/Linux Intel use the same Node/Python code. Do not commit absolute paths. Use .env for local paths. If an npm cache is not writable, pass --cache with a writable local cache directory; never change global ownership as part of this project.

```sh
npm ci
npm run check
npm run contracts:generate
npm run contracts:check
```

Copy .env.example to .env (Windows PowerShell: Copy-Item .env.example .env). Choose a local database password; use the matching password in DATABASE_URL. Do not commit .env. APP_ENV=development allows local HTTP cookies; future HTTPS hosting must enable secure cookies.

Optional database:

```sh
docker compose config --quiet
docker compose up -d db
```

Only PostgreSQL is provisioned; no application starts and no migrations run. docker compose down stops it while retaining the volume. Do not use down -v unless deliberately deleting local data.

Future dev servers must bind loopback by default. Port 5173 is dashboard; 5174 simulator; 8000 backend. Both Vite configurations proxy /api and /ws to backend. Use the same hostname (localhost or 127.0.0.1) for both apps so the session cookie is shared; origins for both loopback forms are explicitly allowed. Never put API keys or database URLs in frontend environment files. For separate-laptop development, each developer normally runs their own stack; cross-machine network deployment is a later explicit configuration.

The first backend ticket should run uv lock and uv sync --group dev inside backend/ and commit uv.lock. The first UI/sim ticket adds its scoped runtime dependencies and updates root package-lock.json. Do not implement fake health endpoints just to satisfy a scaffold command.

Optional full OpenAPI validation (also run in CI): install scripts/requirements-validation.txt in an isolated Python environment, then run `python scripts/validate-openapi.py`. This validates the specification without running a backend.
