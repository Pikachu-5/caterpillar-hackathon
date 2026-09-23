# Realtime protocol v1

Planned endpoints: `/ws/v1/publisher` and `/ws/v1/dashboard`. All messages conform to shared/schemas/message.schema.json. These sockets are not implemented yet.

## Authentication and selection

Both sockets require the authenticated same-site session cookie and an Origin from ALLOWED_ORIGINS. Browser clients use the Vite proxy. Reject missing/expired cookies or disallowed origins before accepting the connection. No secret in a query string. Obtain operator_id from the authenticated session, never from a trusting read of a payload.

Create an operating session through POST /api/v1/sessions. Backend demo/replay sources are internal; there is no external publisher for them. A simulator client must log into its own browser app as the same operator, obtain a CSRF token from /auth/me, and send publisher_hello as its first message within 5 seconds. Its token and session ownership are checked before accepting frames. Return snapshot after a valid hello so the simulator knows the site, environment and session state. A second publisher for that session is rejected with conflict; do not steal the connection.

Dashboard sends subscribe with an owned session_id after connecting. Server replies snapshot, then publishes updates. A dashboard reconnect always gets a new full snapshot; v1 does not promise exactly-once live message delivery or delta replay. A no-session dashboard uses REST task/history views until a session is selected.

## Message directions

| Direction | Allowed types |
| --- | --- |
| Simulator → server | publisher_hello, world_frame, ping, pong |
| Dashboard → server | subscribe, ping, pong |
| Server → simulator | snapshot, frame_ack, environment_update, session_update, error, ping, pong |
| Server → dashboard | snapshot, world_frame, safety_event, task_update, insight, prediction, environment_update, session_update, stream_status, error, ping, pong |

A valid message type on the wrong socket/direction is rejected. A schema-valid arbitrary payload is not automatically authorized.

## World frame

One atomic frame contains machine telemetry, attachment pose, dynamic actors and discrete work events. Static geometry/obstacles/destinations come from the matching site revision. Environment is a backend-owned separate object referenced by environment_id. Simulator acknowledges settings by using the new environment_id in subsequent frames; reject stale IDs with conflict and send the latest environment. The backend demo source uses the same validator/processing path.

All actor and machine geometry is in site meters, southwest origin, x east/y north. Heading 0 = north, 90 = east, 180 = south, 270 = west. Bucket tip position is a world coordinate, not relative to the machine. Angles are simplified simulation inputs; they are not OEM joint calibration. Dashboard shows the supplied reach geometry; safety checks it rather than inferring reach from RPM or a sprite size.

Sequences start at 0 and strictly increase per session. timestamp must be valid UTC, not more than 5 seconds in the future, and never earlier than the previous accepted frame's timestamp. simulation_time_s cannot decrease. Session counters (fuel, idle time, cycles) cannot decrease; engine_hours cannot decrease. Positions/actor IDs/site dimensions, body/arm radii and task references are validated. A frame from the wrong operator/machine/session is rejected. No telemetry is processed when the session is paused/ended; paused UI shows paused rather than stale. Resume continues the same counters and clock.

Default publisher rate: 5 Hz. Backend drops/coalesces obsolete display frames under pressure, not durable work/incident events. Cap a message at 256 KiB and a session at 200 dynamic actors for implementation despite broader schema array bounds. Broadcast latest state at 5 Hz and persist at 1 Hz, plus every event/transition.

## Work events and retries

material_deposited records carry a unique event_id, task_id, destination_id, quantity_m3 and simulation_time_s. The server checks active task, correct destination, bucket reach inside the destination radius, positive plausible quantity and session ownership. Task progress is computed server-side from accepted deposits, not a client-written percentage. Each event is persisted once using unique (session_id,event_id); update task progress and event atomically.

The publisher repeats unacknowledged work events in subsequent frames until frame_ack lists accepted_event_ids. After ownership checks, deduplicate known events before rechecking task activity (the first event may have completed the task). Repeated known events are acknowledged without reapplying progress; changed content for an existing event_id is a conflict. Duplicate/lower frame sequences do not reapply anything. frame_ack represents committed work events, not a promise that every telemetry sample was stored. Retain bounded pending events; if the buffer fills, pause work and show a connection error rather than silently dropping progress.

## Disconnects and failure handling

No frame for 3 seconds during active operation → stale status; 10 seconds → disconnected status. Stop treating proximity readings as current. Raise data-quality warning; do not assert “all clear” or automatically clear real hazards. On disconnect pause task elapsed-time accumulation and request the publisher pause simulation; reconnect resumes only after an explicit session resume and a full state sync. A reconnect cannot roll back counters or clock. End/reset creates a **new session**, clears session counters and releases the publisher lease. Preserve the old history.

Use ping/pong every 15 seconds; timeout 30 seconds. Reconnect with capped backoff (1,2,4,8,10 seconds with jitter); clean up prior socket handlers. Authentication errors require re-login; validation errors require correcting the payload rather than reconnect storms. Close codes: 1008 auth/protocol policy, 1009 oversized frame, 1011 server failure. Structured errors contain no stack traces or credentials.

Replay stamps current runtime timestamps while retaining original historical timestamps in replay metadata/storage, never pretending old records are live sensor observations. v1 runs at 1x simulation time. Database sample aggregation uses simulation elapsed time, not playback network speed.
