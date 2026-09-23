# Integration acceptance, before declaring the product connected

These are future end-to-end checks, not claims of completed tests.

1. Register/login two operators; each sees only their own tasks, sessions, incidents, training progress and answers. A guessed foreign ID cannot expose another operator's history.
2. Run the dashboard with **no simulator process**. Start a backend demo session and receive a full site/environment/frame snapshot, followed by updates. Show worker, vehicle, obstacle, terrain, restricted area, destinations, attachment geometry and trail.
3. Trigger seatbelt/proximity/overheat through demo controls. Show visual/audio warnings, acknowledgment and persistent incident history. Repeated frames do not create duplicate incidents. Warning paths never actuate the machine.
4. Create/edit/reorder daily tasks; exercise stale revisions and concurrent updates. Accept one material deposit once even if sent repeatedly. Incorrect destination or other-operator tasks are rejected. Preset A→B work updates backend-derived progress.
5. Independently run the simulator against the same schema fixtures first, then authenticated WebSocket ingest. Log in as the same operator, select a simulator session, receive snapshot, publish frames, acknowledge work events. UI code does not change to swap sources.
6. End the demo session before selecting simulator source. Old frames cannot overwrite new state. Coordinates, heading, bucket tip and actors match across views; positions are meters, not pixels/latitudes. Test nonzero y and heading 90° to catch coordinate inversion.
7. Disconnect/reconnect. Stale status appears; counters do not roll back; pending work events are accepted once; a full snapshot restores state. Paused clock/time does not inflate task duration or trigger false freshness alarms.
8. Switching demo/live weather changes source indicators and effective environment; missing weather is explicit. Soil retains its own provenance. The synthetic map never moves to the weather city.
9. Show synthetic dataset manifest, held-out ETA metrics vs baseline, anomaly evidence, training recommendation and persisted quiz result. Do not describe synthetic accuracy as real CAT performance.
10. Ask a CAT 325 question answerable from the approved manual: return valid document/page citations. Ask an unsupported question: abstain. Missing API key/network does not prevent tasks/safety/map operation.

Before parallel integration, coordinate root dependencies/lockfiles and commit changes in focused PRs. Validate schemas, REST/API status mappings, and downstream type generation whenever a shared field changes.
