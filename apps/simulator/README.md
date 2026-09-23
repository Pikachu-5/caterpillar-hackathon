# CAT 325 simulator

Standalone Phaser 3 site simulator for the CAT 325. It loads the canonical local site fixture and renders site-meter coordinates in a top-down view. The browser simulation emits atomic, schema-validated world frames at 5 Hz, with explicit telemetry overrides and a bounded queue of deposit events. SIM-003 connects this runtime to the authenticated backend; it does not implement that server.

## Run

From the repository root, install dependencies and start the simulator workspace:

```sh
npm install
npm run dev --workspace apps/simulator
```

Vite serves the app on `127.0.0.1:5174`.

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

All frames and identifiers use the shared v1 schemas; the tracked CAT 325 profile has no tire telemetry. Runtime motion and frame creation do not depend on a network adapter. SIM-003 adds login, session/source handoff, and the authenticated publisher connection; backend tickets BE-002, BE-003, and BE-005 remain dependencies for a live end-to-end run.
