# CAT Operator Hub

An operator-first hackathon companion for CAT machinery. The initial machine is the **CAT 325 excavator**. The dashboard, safety, training, unusual-usage detection, and task-time estimation are the product; the separate 2D simulator is a later telemetry source.

**Status: scaffold only. No product feature, login, API endpoint, dashboard, simulator, ML model, or voice service is implemented.** Configuration and contracts describe the intended implementation, not existing behavior. Contract fixtures are examples, not a training dataset.

## Start here

1. Read [AGENTS.md](AGENTS.md) for scope and workstream boundaries.
2. Read [root.md](root.md) for the repository map and the new-chat handoff.
3. Read [PROJECT_SPEC.md](PROJECT_SPEC.md) for accepted requirements.
4. Read [architecture.md](architecture.md), [API](docs/api.md), and [realtime protocol](docs/realtime.md).
5. Pick one ticket in [the implementation backlog](docs/backlog.md), read the directory's AGENTS.md, and work in a focused branch.

## Validate the scaffold

Use Node **22.14+ within 22.x**, npm 10+, and Python **3.12** for future Python work.

```sh
npm ci
npm run check
npm run contracts:generate
npm run contracts:check
```

`npm run check` validates schemas, examples, API references, links, and failure cases. `contracts:generate` produces TypeScript declarations only. It does not build the app. The workspace packages intentionally have no fake `dev` or `build` commands.

Optional database infrastructure (no tables or migrations yet): copy `.env.example` to `.env`, set a local database password, then run:

```sh
docker compose config --quiet
docker compose up -d db
```

Docker is optional. A native PostgreSQL 17 installation is supported. Native Node/Python processes keep development portable between Apple Silicon macOS and Windows/Linux Intel machines. See [setup](docs/setup.md).

## Implementation order

Contracts → backend/auth + deterministic demo feed → operator dashboard/map/safety → dataset/ETA/anomalies + training/document Q&A → separate simulator integration → optional voice.

The simulator may be developed independently after contracts are accepted; dashboard delivery must never wait for it. See [integration acceptance](docs/integration.md).

No GitHub issues, feature branches, or third-party accounts are created by this scaffold. The issue-ready backlog and templates are checked in. No secrets or manual PDFs are bundled.
