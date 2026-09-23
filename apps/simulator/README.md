# CAT 325 simulator

Standalone Phaser 3 site simulator for the CAT 325. It loads the canonical local site fixture and renders site-meter coordinates in a top-down view. The browser simulation emits atomic, schema-validated world frames at 5 Hz, with explicit telemetry overrides and a bounded queue of deposit events. SIM-003 connects this runtime to the authenticated backend; it does not implement that server.

## Run

From the repository root, install dependencies and start the simulator workspace:

```sh
npm install
npm run dev --workspace apps/simulator
```

Vite serves the app on `127.0.0.1:5174`.

The simulator proxies `/api` and `/ws` to `127.0.0.1:8000` in development. Start the backend separately, then sign in with the same operator account used by the dashboard. The simulator has its own login screen and keeps the CSRF token in memory; cookies are sent only to the same-origin API and the token is never placed in a URL or persisted in browser storage.

## Controls

| Keys | Action |
| --- | --- |
| W / S | Travel forward / reverse |
| A / D | Turn tracks |
| Q / E | Swing upper body |
| R / F | Raise / lower boom |
| T / G | Move stick |
| Y / H | Curl / dump bucket |
| Space | Pick up at A or deposit at B |

The engine, seatbelt, parking brake, pause, reset, and worker-proximity staging controls are available on screen. Workers and a support vehicle follow demo paths. Telemetry override sliders are disabled until selected; active fields are listed in each frame's `overridden_fields`. Pickup and deposit actions require the bucket tip to be inside the corresponding site destination. Each accepted local deposit is kept in the bounded outbox until an acknowledgement removes it. Reset starts a new local session and clears session counters, sequence, and pending events. Kinematics and telemetry are illustrative demo values, not OEM limits or an engineering model.

The environment strip beside the site map shows the current weather and temperature, terrain, soil type, and soil moisture. Weather mode and freshness remain visible; soil is labeled with its demo/operator/unknown source. Snapshot and live environment updates refresh these cues. They describe the supplied environment and do not change simulator movement or imply a live soil sensor.

All frames and identifiers use the shared v1 schemas; the tracked CAT 325 profile has no tire telemetry. Runtime motion and frame creation do not depend on a network adapter. SIM-003 adds login, session/source handoff, and the authenticated publisher connection; backend tickets BE-002, BE-003, and BE-005 remain dependencies for a live end-to-end run.

The **Start simulator session** action ends any open session for the selected machine and creates a simulator-source session on that session's site (or the active task's site). A material-volume task must already be active in the dashboard. The publisher sends `publisher_hello` with the current CSRF token, then sends schema-validated frames only after the server snapshot arrives. Work events remain in a bounded in-memory outbox until `frame_ack`; reconnects retain them and resume only after an explicit operator resume. Reset ends the current session and starts a new one, retaining backend history.

SIM-003 is an adapter against the committed API/realtime contracts. The current repository scaffold does not implement BE-002, BE-003, or BE-005, so live login, publisher acceptance, acknowledgements, session handoff, and dashboard mirroring require those backend tickets; a successful production connection cannot be claimed from the simulator build alone.
