# Accepted product scope

## Product and audience

Smart Operator Assistant for CAT machinery, for the **individual operator only**. No supervisor or fleet-management interface. First supported machine: **CAT 325 excavator**, with knowledge scoped to manual M0099648-02 (November 2020), TEL 1-UP. Future vehicles require separate contracts/model profiles and verified documentation.

## Required outcomes

- Login accounts with persistent operator-specific task, session, incident, training and performance history.
- Daily task dashboard: preloaded demo work plus create, edit, reorder, start, pause, resume and complete tasks. Scheduling conflicts and invalid state transitions must be visible.
- Custom simulated construction-site map embedded in the dashboard. It mirrors machine position/heading/attachment reach, workers, other vehicles, obstacles, restricted zones, terrain, destinations, hazards and travel trail. This is not a satellite/GPS basemap.
- Dashboard works first with a backend demo/replay source. Later the separate simulator supplies the same validated state without a dashboard rewrite.
- Warning-only deterministic safety: seatbelt, worker/vehicle proximity including boom/bucket reach and swing, restricted zones, speed, engine/hydraulic conditions and working conditions. Acknowledgment, visual/audio notification, resolution and persistent incident history.
- Detect unusual machine usage, especially idling and unsafe operating patterns, and explain the observed evidence.
- Task-time estimation from generated historical data and working conditions, with estimated vs actual comparison and honest uncertainty.
- Training hub: short interactive lessons, quizzes, completion history and recommendations related to recurring issues. It must be useful before simulator training exists.
- Text assistant grounded in publicly accessible CAT 325 documentation, with document/page citations and explicit abstention for unsupported questions. Gemini API may be used with a small configurable budget. Voice is deferred.
- Selectable demo weather/environment and live weather for a chosen geographic site location. The map stays synthetic. Source/freshness and failures are visible; never silently change live mode into synthetic weather.

## Simulator, when implemented later

Separate browser app; simplified **2D top-down** construction world. Keyboard controls for forward/reverse travel, track turning, upper-body swing, boom/stick movement and bucket curl/dump; start/stop engine, seatbelt and parking controls. Simplified kinematics, not an engineering-accurate digital twin.

Use a bucket pickup/deposit workflow and preset source/destination jobs. Track deposited volume and completed load cycles to drive task progress. Workers/other vehicles follow preset routes; demo controls can spawn a proximity scenario. Telemetry sliders override selected readings and display explicit override status. Derived metrics otherwise respond consistently to operation.

The dashboard map is observational: task/environment controls go through backend APIs; it does not directly drive the excavator. Safety alerts never change movement automatically. All controls and inferred measurements are simulation-only.

## Data

Two source tables were supplied in photos: four machine-use records and five completed-task records. Their exact transcription is under data/reference/. The timestamps have no supplied timezone or aggregation interval; preserve them as given. Additional environmental/context fields are allowed, but original fields/values must remain available unchanged. Generated records must be marked synthetic and generation assumptions documented. Do not claim measured fuel curves or predictive validity from nine sample rows. See docs/data.md.

## Delivery constraints

One laptop for the integrated demo; Apple Silicon macOS and Intel Windows/Linux support. Development can occur on separate machines with independent agents. Prefer free/open-source tools, with optional Gemini spending. No OS-specific absolute paths in product configuration. No dependence on Apple-only inference or NVIDIA hardware.

## Not part of this scaffold

No implementation of UI, API handlers, auth, database migrations, simulator, demo generator, models, ingestion, quizzes, voice, live weather calls or external AI calls. No generated bulk training data. Schema examples and validation tooling are the only executable examples.

## Later / non-goals

Voice activation/STT/TTS; multiple controllable vehicle types; supervisor screens; production deployment; real machine actuation; certified safety detection; realistic excavator physics; automatic scheduling optimization; instructor booking; actual sensor/CAN integration.
