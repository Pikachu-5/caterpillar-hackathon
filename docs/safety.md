# Warning-only safety specification

These are simulated demo rules, not an OEM-certified protection system. config/demo-defaults.json gives explicit provisional thresholds. All numeric threshold choices are **synthetic design assumptions**, not quoted CAT limits. Manual-based training content uses exact source citations separately.

## Rules and evidence

- Seatbelt: unfastened while engine running and operating (travel speed >0.1 km/h or attachment moved since previous frame). Do not equate a stationary excavator with inactive work.
- Proximity: minimum clearance from machine body circle and boom/bucket swept geometry to worker/vehicle/obstacle footprints. Use the line from upper-body pivot to bucket tip, expanded by arm_safety_radius_m, plus conservative sweep between successive frames. Account for actor radius; worker distance is not center-to-center distance. Predictive trajectories/3D collision physics are out of v1.
- Restricted zones: body or arm envelope intersects restricted polygon. Not just machine center inside polygon.
- Speed, temperature, hydraulic pressure/temperature: compare effective known readings with versioned demo thresholds. Null readings are unavailable, never zero.
- Working conditions: configured wind/rain/terrain/soil conditions can issue conservative advisory warnings with explicit synthetic thresholds. Live weather is modeled regional data, not an on-machine sensor.
- Data quality: stale/disconnected publisher, unknown conditions or invalid frames shown separately; no reassuring “safe” badge when input is unavailable.

Emit warnings only. Do not send stop, brake, throttle, attachment-lock or shutdown commands. Sliders intentionally override telemetry and can trigger warnings, but alerts do not change sliders or physical movement.

## Episodes

Deduplicate by session + rule + subject. New hazardous condition starts one alert/incident. Update severity/evidence/minimum distance without spawning an incident each frame. Escalation may repeat audio once; acknowledgment silences repeated audio for the current severity but leaves the alert active. Resolve only after the condition clears continuously for 2 simulated seconds, with appropriate threshold hysteresis (10% for numeric thresholds). A later recurrence starts a new episode. Pause freezes evaluation and shows paused. Session end/source loss records an explicit end reason, not false evidence that the hazard cleared.

Critical proximity enters at <=2m clearance, warning at <=5m; these values are demonstration assumptions. Loss of data must not resolve hazards as condition_cleared. Record first/last/resolved times, rule version, evidence units and override state in the associated frame history.

## Verification required during implementation

Test distance to bucket/arm while body is far away, swing between frames, restricted-boundary intersection, seatbelt during stationary digging, hysteresis, warning escalation, acknowledgment without resolution, missing sensor values and disconnect behavior. Assert that no warning path changes simulated movement. Audio requires an explicit user enable action for browser autoplay; UI still shows alerts when audio is unavailable.
