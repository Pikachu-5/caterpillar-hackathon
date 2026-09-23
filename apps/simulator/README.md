# SIM-001 · Separate CAT 325 site and controls

Standalone Phaser 3 site simulator for the CAT 325. It loads the canonical local site fixture and renders site-meter coordinates in a top-down view. All movement, readings, work progress, and controls are local demo state; no backend or dashboard integration is included in this ticket.

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

The engine, seatbelt, parking brake, pause, and reset controls are available on screen. Workers and a support vehicle follow fixed demo paths. Reset clears the local job and session readings. Kinematics and telemetry are illustrative demo values, not OEM limits or an engineering model.

Next simulator ticket: **SIM-002**, which adds contract-shaped telemetry, override controls, and acknowledged backend work events. Authenticated publisher integration belongs to **SIM-003** after its backend dependencies are available.
