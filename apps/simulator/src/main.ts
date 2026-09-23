import Phaser from "phaser";
import site from "../../../shared/fixtures/site.json";
import environment from "../../../shared/fixtures/environment.json";
import machine from "../../../shared/fixtures/machine.json";
import { SiteScene } from "./scene";
import { FrameStream, WorkEventOutbox } from "./telemetry";
import { BackendError, backend, PublisherConnection } from "./backend";
import type { AuthState, Environment, Machine, Point, Session, Site as SiteContract, Snapshot, Task, Telemetry, WorldFrame, WorkEvent } from "@cat-hub/contracts";
import "./style.css";

type SimState = {
  x_m: number; y_m: number; heading_deg: number; upper_heading_deg: number;
  speed_mps: number; boom_angle_deg: number; stick_angle_deg: number;
  bucket_angle_deg: number; bucket_load_m3: number; engine_running: boolean;
  seatbelt_fastened: boolean; parking_brake_engaged: boolean; fuel_used_l: number;
  idle_seconds: number; load_cycles: number; elapsed_s: number;
  deposited_m3: number; engine_hours: number;
};
type SiteActor = { actor_id: string; kind: "worker" | "vehicle"; position: Point; heading_deg: number; radius_m: number; speed_kmh: number };
type OverrideField = "rpm" | "throttle_percent" | "fuel_percent" | "engine_temperature_c" | "hydraulic_pressure_psi" | "hydraulic_temperature_c" | "load_percent";
type OverrideSetting = { label: string; min: number; max: number; step: number; value: number };

let siteData = site as SiteContract;
const root = document.querySelector<HTMLDivElement>("#app")!;
let machineData: Machine = machine as Machine;
let operatorId = "";
let taskData: Task | null = null;
let environmentData: Environment = environment as Environment;
let authState: AuthState | null = null;
let currentSession: Session | null = null;
let activeTasks: Task[] = [];
let publisher: PublisherConnection | null = null;
let sessionBusy = false;
const overrideSettings: Record<OverrideField, OverrideSetting> = {
  rpm: { label: "Engine RPM", min: 0, max: 5000, step: 50, value: 1350 },
  throttle_percent: { label: "Throttle", min: 0, max: 100, step: 1, value: 36 },
  fuel_percent: { label: "Fuel level", min: 0, max: 100, step: 1, value: 78 },
  engine_temperature_c: { label: "Engine temperature", min: -20, max: 150, step: 1, value: 82 },
  hydraulic_pressure_psi: { label: "Hydraulic pressure", min: 0, max: 6000, step: 50, value: 2100 },
  hydraulic_temperature_c: { label: "Hydraulic temperature", min: -20, max: 130, step: 1, value: 55 },
  load_percent: { label: "Machine load", min: 0, max: 100, step: 1, value: 24 },
};
const state: SimState = {
  x_m: 19, y_m: 22, heading_deg: 0, upper_heading_deg: 153.435, speed_mps: 0,
  boom_angle_deg: 90, stick_angle_deg: 90, bucket_angle_deg: 15,
  bucket_load_m3: 0, engine_running: true, seatbelt_fastened: true,
  parking_brake_engaged: false, fuel_used_l: 0, idle_seconds: 0,
  load_cycles: 0, elapsed_s: 0, deposited_m3: 0, engine_hours: 1523.5,
};
const actors: SiteActor[] = [];
const outbox = new WorkEventOutbox(64);
const overrides: Partial<Record<OverrideField, number>> = {};
let game: Phaser.Game | null = null;
let scene: SiteScene | null = null;
let frameStream: FrameStream | null = null;
let unsubscribeFrames: (() => void) | null = null;
let latestFrame: WorldFrame | null = null;
let paused = true;
let animationFrame = 0;
let previousTick = performance.now();
let keys = new Set<string>();
let bannerTimer = 0;
let hazardStaged = false;
let localSessionId = makeLocalSessionId();

function renderShell(): void {
  root.innerHTML = `<div class="app-shell">
    <header class="topbar"><a class="brand" href="#"><span class="cat-badge">CAT</span><span>OPERATOR SIMULATOR</span></a><div class="top-status"><span id="frame-dot" class="status-dot live"></span><span id="frame-status">LOCAL FRAME STREAM · 5 HZ</span><span class="divider"></span><span class="operator-label">CAT 325 · TRACKED EXCAVATOR</span></div></header>
    <main class="cockpit">
      <section class="workspace">
        <div class="section-heading"><div><p id="site-label" class="eyebrow">${escapeHtml(siteData.name)} · ${siteData.width_m} × ${siteData.height_m} m</p><h1>CAT 325 <span class="subheading">Site Simulator</span></h1></div><div class="source-chip"><span class="pulse"></span><span id="source-label">NO ACTIVE SESSION</span></div></div>
        <div class="viewport"><div id="sim-world"></div><div class="viewport-label"><span>LOCAL SITE COORDINATES</span><span id="metric-position">MACHINE 018, 024 M</span><span>ORIGIN SOUTHWEST · +X EAST · +Y NORTH</span></div></div>
        <div class="control-strip"><div class="switch-group"><button id="engine-control" class="toggle-button"></button><button id="belt-control" class="toggle-button"></button><button id="brake-control" class="toggle-button"></button></div><div class="action-group"><button id="session-control" class="primary small">Start simulator session</button><button id="pause-control" class="secondary small" disabled>Pause simulation</button><button id="hazard-control" class="secondary small">Stage worker proximity</button><button id="reset-control" class="secondary small">Reset session</button><button id="logout-control" class="secondary small">Log out</button></div></div>
        <div class="key-legend"><span class="legend-title">CONTROLS</span><kbd>W</kbd><kbd>S</kbd><span>travel</span><kbd>A</kbd><kbd>D</kbd><span>tracks</span><kbd>Q</kbd><kbd>E</kbd><span>swing</span><kbd>R</kbd><kbd>F</kbd><span>boom</span><kbd>T</kbd><kbd>G</kbd><span>stick</span><kbd>Y</kbd><kbd>H</kbd><span>bucket</span><kbd>Space</kbd><span>pickup / deposit</span></div>
        <div class="banner hidden" id="banner" role="status"></div>
      </section>
      <aside class="telemetry-panel">
        <div class="panel-title"><div><p class="eyebrow">SIMULATED READINGS</p><h2>Machine status</h2></div><span id="machine-state" class="machine-state running">RUNNING</span></div>
        <div class="metric-grid"><div class="metric"><span>GROUND SPEED</span><strong id="metric-speed">0.0</strong><small>km/h</small></div><div class="metric"><span>ENGINE SPEED</span><strong id="metric-rpm">1,200</strong><small>RPM</small></div><div class="metric"><span>FUEL USED</span><strong id="metric-fuel">0.0</strong><small>L this session</small></div><div class="metric"><span>LOAD CYCLES</span><strong id="metric-cycles">0</strong><small>cycles</small></div></div>
        <div class="task-card"><div class="task-heading"><h3>Active backend task</h3><span id="task-state" class="task-state">NO TASK</span></div><strong id="task-title">No active task selected</strong><p id="task-route">Start a simulator session after an active material-volume task is available.</p><div id="task-amount" class="task-amount">Deposit events will be acknowledged by the backend.</div><button id="work-control" class="primary work-button" disabled>Pickup / deposit material</button></div>
        <div class="task-card attachment-card"><div class="task-heading"><h3>Attachment pose</h3><span class="local-tag">SIMPLIFIED KINEMATICS</span></div><div class="pose-grid"><div><span>BOOM</span><strong id="metric-boom">35°</strong></div><div><span>STICK</span><strong id="metric-stick">−30°</strong></div><div><span>BUCKET</span><strong id="metric-bucket">15°</strong></div><div><span>UPPER BODY</span><strong id="metric-swing">000°</strong></div></div></div>
        <details id="override-card" class="override-card"><summary><span>Telemetry overrides</span><span id="override-mark" class="override-mark">0 OVERRIDDEN</span></summary><p class="hint">Override individual readings; active fields are marked in every schema-validated frame.</p><div id="override-list" class="override-list"></div><button id="clear-overrides" class="text-button" type="button">Clear all overrides</button></details>
        <div class="site-facts"><div><span>HEADING</span><strong id="metric-heading">000°</strong></div><div><span>BUCKET LOAD</span><strong id="metric-load">0.00 m³</strong></div><div><span>SIM TIME</span><strong id="metric-time">00:00</strong></div></div>
        <p class="notice">All readings and movement are simulated. This is a simplified 2D demo, not a CAT machine model.</p>
      </aside>
    </main>
  </div>`;
  bindControls();
  createGame();
  loadBackendWorkspace();
  updateReadings();
}

function createGame(): void {
  scene = new SiteScene();
  game = new Phaser.Game({
    type: Phaser.AUTO, parent: "sim-world", backgroundColor: "#202720", width: 960, height: 640,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene], render: { antialias: true, pixelArt: false },
  });
  game.events.once("ready", () => scene?.configure(siteData, state, actors));
  animationFrame = window.setInterval(() => tick(performance.now()), 50);
  frameStream = new FrameStream(makeFrame, 200, error => {
    setFrameStatus("FRAME REJECTED BY SHARED SCHEMA", "error");
    showBanner(error instanceof Error ? error.message : "The simulator generated an invalid frame.", true);
  });
  unsubscribeFrames = frameStream.subscribe(frame => {
    latestFrame = frame;
    setFrameStatus(`FRAME ${frame.sequence} VALIDATED · 5 HZ`, "live");
    publisher?.publish(frame);
    onFrame(frame);
  });
  if (paused) frameStream.pause(); else frameStream.start();
}

function bindControls(): void {
  root.querySelector<HTMLButtonElement>("#engine-control")!.onclick = () => { state.engine_running = !state.engine_running; if (!state.engine_running) state.speed_mps = 0; updateReadings(); };
  root.querySelector<HTMLButtonElement>("#belt-control")!.onclick = () => { state.seatbelt_fastened = !state.seatbelt_fastened; updateReadings(); };
  root.querySelector<HTMLButtonElement>("#brake-control")!.onclick = () => { state.parking_brake_engaged = !state.parking_brake_engaged; if (state.parking_brake_engaged) state.speed_mps = 0; updateReadings(); };
  root.querySelector<HTMLButtonElement>("#pause-control")!.onclick = () => {
    void toggleSessionPause();
  };
  root.querySelector<HTMLButtonElement>("#reset-control")!.onclick = resetSimulation;
  root.querySelector<HTMLButtonElement>("#session-control")!.onclick = () => { void startSimulatorSession(); };
  root.querySelector<HTMLButtonElement>("#logout-control")!.onclick = () => { void logout(); };
  root.querySelector<HTMLButtonElement>("#hazard-control")!.onclick = toggleHazard;
  root.querySelector<HTMLButtonElement>("#work-control")!.onclick = pickupOrDeposit;
  root.querySelector<HTMLButtonElement>("#clear-overrides")!.onclick = clearOverrides;
  renderOverrides();
  window.addEventListener("keydown", keyHandler);
  window.addEventListener("keyup", keyHandler);
  window.addEventListener("blur", releaseKeys);
}

function renderLogin(message = "Sign in with your operator account to connect this simulator to the backend."): void {
  root.innerHTML = `<main class="login-shell"><section class="login-card"><div class="brand-mark">CAT<span>OPERATOR SIMULATOR</span></div><p class="eyebrow">AUTHENTICATED SIMULATOR</p><h1>Operator sign in</h1><p class="muted">Use the same operator account as the dashboard.</p><form id="login-form"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Sign in</button><p id="login-message" class="form-message" role="status">${escapeHtml(message)}</p></form></section><aside class="login-art"><div class="site-line"></div><div class="mini-excavator">325</div><span>SIMULATED SITE · AUTHENTICATED FEED</span></aside></main>`;
  root.querySelector<HTMLFormElement>("#login-form")!.onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const button = root.querySelector<HTMLButtonElement>("#login-form button")!; button.disabled = true;
    try { authState = await backend.login(String(form.get("username")), String(form.get("password"))); operatorId = authState.operator.operator_id; renderShell(); }
    catch (error) { const label = root.querySelector<HTMLElement>("#login-message"); if (label) label.textContent = error instanceof Error ? error.message : "Sign in failed."; button.disabled = false; }
  };
}

async function loadBackendWorkspace(): Promise<void> {
  if (!authState) {
    try { authState = await backend.me(); operatorId = authState.operator.operator_id; }
    catch (error) { renderLogin(error instanceof BackendError && error.status !== 401 ? error.message : undefined); return; }
  }
  try {
    const [machines, sessions, tasks] = await Promise.all([backend.machines(), backend.sessions(), backend.tasks()]);
    const selected = machines.find(item => item.model === "CAT 325");
    if (!selected) throw new Error("No CAT 325 machine is assigned to this operator.");
    machineData = selected;
    const relatedSessions = sessions.filter(item => item.machine_id === selected.machine_id).sort((a, b) => b.started_at.localeCompare(a.started_at));
    const siteId = relatedSessions[0]?.site_id;
    activeTasks = tasks.filter(item => item.machine_id === selected.machine_id && (!siteId || item.site_id === siteId) && item.status === "active");
    taskData = activeTasks.find(item => item.progress_mode === "material_volume" && item.source_destination_id && item.target_destination_id) ?? null;
    const title = root.querySelector<HTMLElement>("#task-title"), route = root.querySelector<HTMLElement>("#task-route"), button = root.querySelector<HTMLButtonElement>("#work-control");
    if (title) title.textContent = taskData?.title ?? "No active material-volume task";
    if (route) route.textContent = taskData ? `Task destination ${taskData.target_destination_id ?? "not set"} · ${taskData.completed_quantity_m3.toFixed(2)} / ${taskData.target_quantity_m3?.toFixed(2) ?? "—"} m³` : "Create and start a material-volume task in the dashboard before recording deposits.";
    if (button) button.disabled = !taskData;
    setFrameStatus("AUTHENTICATED · READY TO START", "paused");
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) { authState = null; renderLogin("Your sign-in expired. Sign in again to continue."); }
    else showBanner(error instanceof Error ? error.message : "Could not load operator data.", true);
  }
}

async function startSimulatorSession(): Promise<void> {
  if (!authState || sessionBusy) return;
  if (!taskData) { showBanner("Start a material-volume task with source and deposit destinations for the selected CAT 325 first.", true); return; }
  sessionBusy = true;
  const button = root.querySelector<HTMLButtonElement>("#session-control"); if (button) button.disabled = true;
  try {
    const sessions = await backend.sessions();
    const openSession = sessions.find(item => item.machine_id === machineData.machine_id && item.status !== "ended");
    if (openSession) await backend.sessionAction(authState.csrf_token, openSession.session_id, "end");
    const session = await backend.startSession(authState.csrf_token, { machine_id: machineData.machine_id, site_id: openSession?.site_id ?? taskData.site_id ?? siteData.site_id, source: "simulator", scenario_id: null });
    currentSession = session; localSessionId = session.session_id;
    const snapshot = await backend.snapshot(session.session_id);
    applySnapshot(snapshot);
    publisher?.close();
    let firstSnapshot = true;
    publisher = new PublisherConnection(session.session_id, authState.csrf_token, {
      snapshot: snapshot => {
        applySnapshot(snapshot);
        if (firstSnapshot && snapshot.session?.status === "active") { firstSnapshot = false; paused = false; frameStream?.resume(); previousTick = performance.now(); updateReadings(); }
      },
      acknowledged: ids => { outbox.acknowledge(ids); updateReadings(); },
      environment: next => { environmentData = next; showBanner("Site environment updated by the backend."); },
      session: update => { currentSession = update; if (update.status !== "active") pauseLocally(update.status === "paused" ? "SESSION PAUSED" : "SESSION ENDED"); else setFrameStatus("SESSION ACTIVE", "live"); },
      task: update => {
        const index = activeTasks.findIndex(item => item.task_id === update.task_id);
        if (index >= 0) activeTasks[index] = update; else activeTasks.push(update);
        if (taskData?.task_id === update.task_id) taskData = update.status === "active" ? update : null;
        if (!taskData && update.status === "active" && update.progress_mode === "material_volume" && update.source_destination_id && update.target_destination_id) taskData = update;
        const title = root.querySelector<HTMLElement>("#task-title"), button = root.querySelector<HTMLButtonElement>("#work-control");
        if (title) title.textContent = taskData?.title ?? "No active material-volume task";
        if (button) button.disabled = !taskData;
        updateReadings();
      },
      status: status => {
        if (status === "live") { setFrameStatus("PUBLISHER CONNECTED · 5 HZ", "live"); }
        else if (status === "login") { pauseLocally("REAUTHENTICATION REQUIRED"); showBanner("The publisher session was rejected. Sign in again to reconnect.", true); }
        else { pauseLocally(status === "connecting" ? "PUBLISHER CONNECTING" : "PUBLISHER DISCONNECTED"); }
      },
      error: message => showBanner(message, true),
    });
    publisher.connect();
    paused = true; frameStream?.pause(); previousTick = performance.now();
    setSessionControls(true);
    showBanner("Simulator session started. The previous open session was ended when source changed.");
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) { authState = null; publisher?.close(); renderLogin("Your sign-in expired. Sign in again to continue."); }
    else showBanner(error instanceof Error ? error.message : "Could not start simulator session.", true);
    setFrameStatus(error instanceof BackendError && error.status === 401 ? "SIGN IN REQUIRED" : "SESSION START FAILED", "error");
  } finally { sessionBusy = false; if (button) button.disabled = false; }
}

function applySnapshot(snapshot: Snapshot): void {
  if (snapshot.session) currentSession = snapshot.session;
  if (snapshot.site) siteData = snapshot.site;
  if (snapshot.environment) environmentData = snapshot.environment;
  activeTasks = snapshot.tasks.filter(item => item.machine_id === machineData.machine_id && item.status === "active");
  taskData = activeTasks.find(item => item.progress_mode === "material_volume" && item.source_destination_id && item.target_destination_id) ?? null;
  const frame = snapshot.latest_frame;
  if (frame) {
    localSessionId = frame.session_id;
    const clock = Math.max(state.elapsed_s, frame.simulation_time_s);
    const engineHours = Math.max(state.engine_hours, frame.telemetry.engine_hours);
    const fuelUsed = Math.max(state.fuel_used_l, frame.telemetry.fuel_used_l_session);
    const idleSeconds = Math.max(state.idle_seconds, frame.telemetry.idle_time_s_session);
    const loadCycles = Math.max(state.load_cycles, frame.telemetry.load_cycles_session);
    Object.assign(state, {
      x_m: frame.telemetry.position.x_m, y_m: frame.telemetry.position.y_m,
      heading_deg: frame.telemetry.heading_deg, speed_mps: frame.telemetry.speed_kmh / 3.6,
      engine_running: frame.telemetry.engine_running, engine_hours: engineHours,
      fuel_used_l: fuelUsed, idle_seconds: idleSeconds,
      load_cycles: loadCycles, elapsed_s: clock,
      upper_heading_deg: frame.telemetry.attachment.upper_body_heading_deg,
      boom_angle_deg: frame.telemetry.attachment.boom_angle_deg, stick_angle_deg: frame.telemetry.attachment.stick_angle_deg,
      bucket_angle_deg: frame.telemetry.attachment.bucket_angle_deg, bucket_load_m3: frame.telemetry.attachment.bucket_load_m3,
      seatbelt_fastened: frame.telemetry.seatbelt_fastened, parking_brake_engaged: frame.telemetry.parking_brake_engaged,
    });
    actors.splice(0, actors.length, ...frame.actors.map(actor => ({ ...actor, position: { ...actor.position } })));
  }
  frameStream?.reset((frame?.sequence ?? currentSession?.latest_sequence ?? -1) + 1);
  const siteLabel = root.querySelector<HTMLElement>("#site-label");
  if (siteLabel) siteLabel.textContent = `${siteData.name} · ${siteData.width_m} × ${siteData.height_m} m`;
  const title = root.querySelector<HTMLElement>("#task-title"), route = root.querySelector<HTMLElement>("#task-route"), button = root.querySelector<HTMLButtonElement>("#work-control");
  if (title) title.textContent = taskData?.title ?? "No active material-volume task";
  if (route) route.textContent = taskData ? `Deposit at ${taskData.target_destination_id} · ${taskData.completed_quantity_m3.toFixed(2)} / ${taskData.target_quantity_m3?.toFixed(2) ?? "—"} m³` : "Start a material-volume task for this machine and site in the dashboard.";
  if (button) button.disabled = !taskData;
  scene?.configure(siteData, state, actors); scene?.setActors(actors); scene?.setState(state);
  setSessionControls(Boolean(currentSession)); updateReadings();
}

function setSessionControls(active: boolean): void {
  const sessionButton = root.querySelector<HTMLButtonElement>("#session-control"), pauseButton = root.querySelector<HTMLButtonElement>("#pause-control"), source = root.querySelector<HTMLElement>("#source-label");
  if (sessionButton) { sessionButton.textContent = active ? "End session / start new" : "Start simulator session"; sessionButton.disabled = sessionBusy; }
  if (pauseButton) pauseButton.disabled = !active;
  if (source) source.textContent = active ? "SIMULATOR SESSION" : "NO ACTIVE SESSION";
}

function pauseLocally(status: string): void {
  paused = true; frameStream?.pause(); previousTick = performance.now(); setFrameStatus(status, "disconnected"); updateReadings();
}

async function logout(): Promise<void> {
  publisher?.close(); publisher = null; paused = true; frameStream?.pause();
  try {
    if (authState && currentSession && currentSession.status !== "ended") await backend.sessionAction(authState.csrf_token, currentSession.session_id, "end");
  } catch { /* Clear the local session even if the service is unavailable. */ }
  try { if (authState) await backend.logout(authState.csrf_token); } catch { /* Local logout still clears the operator view. */ }
  authState = null; currentSession = null; taskData = null; operatorId = ""; renderLogin();
}

function keyHandler(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d", "q", "e", "r", "f", "t", "g", "y", "h", " "].includes(key)) event.preventDefault();
  if (event.type === "keydown" && key === " " && !event.repeat) pickupOrDeposit();
  if (event.type === "keydown") keys.add(key); else keys.delete(key);
}
function releaseKeys(): void { keys.clear(); }

function tick(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - previousTick) / 1000)); previousTick = now;
  if (paused) { state.speed_mps = 0; return; }
  const drive = Number(keys.has("w")) - Number(keys.has("s"));
  if (!state.engine_running || state.parking_brake_engaged) state.speed_mps = 0;
  else state.speed_mps = Phaser.Math.Clamp(state.speed_mps + drive * 1.2 * dt - (drive === 0 ? Math.sign(state.speed_mps) * Math.min(Math.abs(state.speed_mps), dt * 0.6) : 0), -3, 3);
  const trackTurn = Number(keys.has("d")) - Number(keys.has("a"));
  state.heading_deg = normalize(state.heading_deg + trackTurn * dt * (state.speed_mps === 0 ? 35 : 20));
  const heading = Phaser.Math.DegToRad(state.heading_deg - 90);
  state.x_m = Phaser.Math.Clamp(state.x_m + Math.cos(heading) * state.speed_mps * dt, 1, siteData.width_m - 1);
  state.y_m = Phaser.Math.Clamp(state.y_m - Math.sin(heading) * state.speed_mps * dt, 1, siteData.height_m - 1);
  state.upper_heading_deg = normalize(state.upper_heading_deg + (Number(keys.has("e")) - Number(keys.has("q"))) * dt * 35);
  state.boom_angle_deg = Phaser.Math.Clamp(state.boom_angle_deg + (Number(keys.has("r")) - Number(keys.has("f"))) * dt * 24, -20, 80);
  state.stick_angle_deg = Phaser.Math.Clamp(state.stick_angle_deg + (Number(keys.has("t")) - Number(keys.has("g"))) * dt * 24, -80, 80);
  state.bucket_angle_deg = Phaser.Math.Clamp(state.bucket_angle_deg + (Number(keys.has("y")) - Number(keys.has("h"))) * dt * 30, -90, 90);
  state.elapsed_s += dt; state.engine_hours += state.engine_running ? dt / 3600 : 0;
  state.fuel_used_l += state.engine_running ? Math.max(0.2, Math.abs(state.speed_mps) ? 0.8 : 0.35) * dt / 60 : 0;
  state.idle_seconds += state.engine_running && Math.abs(state.speed_mps) < 0.1 ? dt : 0;
  moveActors(); scene?.setActors(actors); updateReadings();
}

function moveActors(): void {
  const t = state.elapsed_s;
  const worker = actors.find(actor => actor.actor_id === "WORKER001");
  const vehicle = actors.find(actor => actor.actor_id === "VEHICLE001");
  const workerX = hazardStaged ? Phaser.Math.Clamp(state.x_m + 3, 1, siteData.width_m - 1) : 44 + Math.sin(t * 0.1) * 7;
  const workerY = hazardStaged ? state.y_m : 52 + Math.cos(t * 0.1) * 6;
  const vehicleX = 72 + Math.cos(t * 0.065) * 8, vehicleY = 34 + Math.sin(t * 0.065) * 7;
  if (worker) Object.assign(worker, { position: { x_m: workerX, y_m: workerY }, heading_deg: normalize(t * 6), speed_kmh: hazardStaged ? 0 : 1.1 });
  else actors.push({ actor_id: "WORKER001", kind: "worker", position: { x_m: workerX, y_m: workerY }, heading_deg: normalize(t * 6), radius_m: 0.45, speed_kmh: hazardStaged ? 0 : 1.1 });
  if (vehicle) Object.assign(vehicle, { position: { x_m: vehicleX, y_m: vehicleY }, heading_deg: normalize(t * 3.5), speed_kmh: 4.5 });
  else actors.push({ actor_id: "VEHICLE001", kind: "vehicle", position: { x_m: vehicleX, y_m: vehicleY }, heading_deg: normalize(t * 3.5), radius_m: 1.2, speed_kmh: 4.5 });
}

function pickupOrDeposit(): void {
  if (paused) { showBanner("Resume the simulation before moving material.", true); return; }
  if (!currentSession || !taskData) { showBanner("Start a simulator session with an active material-volume task first.", true); return; }
  const pickup = siteData.destinations.find(destination => destination.destination_id === taskData?.source_destination_id);
  const deposit = siteData.destinations.find(destination => destination.destination_id === taskData?.target_destination_id);
  if (!pickup || !deposit) { showBanner("The active task references a destination missing from this site revision.", true); return; }
  const tip = bucketTip();
  const atPickup = distance(tip, pickup.position) <= pickup.radius_m;
  const atDeposit = distance(tip, deposit.position) <= deposit.radius_m;
  if (state.bucket_load_m3 <= 0 && atPickup) {
    state.bucket_load_m3 = 0.5;
    showBanner("Bucket loaded with 0.50 m³ of simulated material. Move to Deposit and unload.");
  } else if (state.bucket_load_m3 > 0 && atDeposit) {
    const event: WorkEvent = {
      event_id: makeEventId(), task_id: taskData.task_id, kind: "material_deposited",
      destination_id: deposit.destination_id, quantity_m3: state.bucket_load_m3,
      simulation_time_s: state.elapsed_s,
    };
    if (!outbox.add(event)) { showBanner("Work-event buffer is full. Keep the bucket loaded until the pending events are acknowledged.", true); return; }
    state.load_cycles += 1; state.bucket_load_m3 = 0;
    showBanner(`Deposit staged · ${event.quantity_m3.toFixed(2)} m³ repeats in each frame until acknowledged.`);
  } else if (state.bucket_load_m3 > 0) showBanner("Move the excavator to the Deposit area before unloading.", true);
  else showBanner("Move the excavator into the Material pickup area to load the bucket.", true);
  updateReadings();
}

function makeFrame(sequence: number): WorldFrame {
  const tip = bucketTip();
  const derived = {
    rpm: state.engine_running ? 1200 + Math.round(Math.abs(state.speed_mps) * 200) : 0,
    throttle_percent: state.engine_running ? Math.min(100, 30 + Math.abs(state.speed_mps) * 12) : 0,
    fuel_percent: Math.max(0, 78 - state.fuel_used_l * 0.025),
    engine_temperature_c: state.engine_running ? 80 + Math.min(18, state.load_cycles * 0.2) : 75,
    hydraulic_pressure_psi: state.engine_running ? 1800 + Math.round(state.bucket_load_m3 * 500) : 0,
    hydraulic_temperature_c: state.engine_running ? 55 + Math.min(18, state.bucket_load_m3 * 12) : 48,
    load_percent: Math.min(100, 14 + state.bucket_load_m3 * 60 + Math.abs(state.speed_mps) * 6),
  };
  const telemetry: Telemetry = {
    machine_id: machineData.machine_id, operator_id: operatorId, machine_model: "CAT 325",
    position: { x_m: state.x_m, y_m: state.y_m }, heading_deg: state.heading_deg,
    speed_kmh: Math.abs(state.speed_mps) * 3.6, engine_running: state.engine_running,
    engine_hours: state.engine_hours, rpm: overrides.rpm ?? derived.rpm,
    throttle_percent: overrides.throttle_percent ?? derived.throttle_percent,
    fuel_percent: overrides.fuel_percent ?? derived.fuel_percent,
    fuel_used_l_session: state.fuel_used_l, engine_temperature_c: overrides.engine_temperature_c ?? derived.engine_temperature_c,
    hydraulic_pressure_psi: overrides.hydraulic_pressure_psi ?? derived.hydraulic_pressure_psi,
    hydraulic_temperature_c: overrides.hydraulic_temperature_c ?? derived.hydraulic_temperature_c,
    load_percent: overrides.load_percent ?? derived.load_percent,
    idle_time_s_session: state.idle_seconds, load_cycles_session: state.load_cycles,
    seatbelt_fastened: state.seatbelt_fastened, operator_present: true,
    parking_brake_engaged: state.parking_brake_engaged,
    attachment: {
      type: "bucket", upper_body_heading_deg: state.upper_heading_deg,
      boom_angle_deg: state.boom_angle_deg, stick_angle_deg: state.stick_angle_deg,
      bucket_angle_deg: state.bucket_angle_deg, bucket_tip_position: tip,
      bucket_tip_height_m: Math.max(0, 1 + Math.sin(Phaser.Math.DegToRad(state.boom_angle_deg)) * 3),
      bucket_load_m3: state.bucket_load_m3, footprint_radius_m: 2.5, arm_safety_radius_m: 1.2,
    },
    overridden_fields: (Object.keys(overrideSettings) as OverrideField[]).filter(field => field in overrides),
  };
  return {
    schema_version: "1.0.0", session_id: localSessionId, site_id: siteData.site_id,
    site_revision: siteData.revision, sequence, timestamp: new Date().toISOString(),
    simulation_time_s: state.elapsed_s, environment_id: environmentData.environment_id,
    telemetry, actors: actors.map(actor => ({ ...actor, position: { ...actor.position } })),
    work_events: outbox.pending(),
  };
}

function onFrame(frame: WorldFrame): void {
  const dot = root.querySelector<HTMLSpanElement>("#frame-dot");
  dot?.classList.add("live");
  if (frame.sequence === 0) setFrameStatus(`FRAME ${frame.sequence} VALIDATED · 5 HZ`, "live");
  updateReadings();
}

function renderOverrides(): void {
  const list = root.querySelector<HTMLDivElement>("#override-list"); if (!list) return;
  list.innerHTML = (Object.entries(overrideSettings) as [OverrideField, OverrideSetting][]).map(([field, config]) => {
    const active = field in overrides, value = overrides[field] ?? config.value;
    return `<label class="override-row"><input type="checkbox" data-override="${field}" ${active ? "checked" : ""}><span>${config.label}</span><input type="range" data-value="${field}" min="${config.min}" max="${config.max}" step="${config.step}" value="${value}" ${active ? "" : "disabled"}><output data-output="${field}">${value}</output></label>`;
  }).join("");
  list.querySelectorAll<HTMLInputElement>("[data-override]").forEach(checkbox => checkbox.onchange = () => {
    const field = checkbox.dataset.override as OverrideField;
    const slider = list.querySelector<HTMLInputElement>(`[data-value="${field}"]`)!;
    if (checkbox.checked) overrides[field] = Number(slider.value); else delete overrides[field];
    slider.disabled = !checkbox.checked; updateReadings();
  });
  list.querySelectorAll<HTMLInputElement>("[data-value]").forEach(slider => slider.oninput = () => {
    const field = slider.dataset.value as OverrideField;
    overrides[field] = Number(slider.value);
    const output = list.querySelector<HTMLOutputElement>(`[data-output="${field}"]`);
    if (output) output.value = slider.value;
    updateReadings();
  });
}

function clearOverrides(): void {
  for (const field of Object.keys(overrides) as OverrideField[]) delete overrides[field];
  renderOverrides(); updateReadings();
}

function toggleHazard(): void {
  hazardStaged = !hazardStaged;
  moveActors(); scene?.setActors(actors);
  const button = root.querySelector<HTMLButtonElement>("#hazard-control");
  if (button) button.textContent = hazardStaged ? "Clear worker proximity" : "Stage worker proximity";
  showBanner(hazardStaged ? "Proximity scenario staged: the worker is held 3 m from the machine. No safety action changes movement." : "Proximity staging cleared; the worker is back on the preset route.");
}

function setFrameStatus(label: string, stateClass: "live" | "paused" | "connecting" | "disconnected" | "stale" | "error"): void {
  const status = root.querySelector<HTMLElement>("#frame-status"), dot = root.querySelector<HTMLElement>("#frame-dot");
  if (status) status.textContent = label;
  if (dot) dot.className = `status-dot ${stateClass}`;
}

function bucketTip(): Point {
  const reach = 3 + Math.max(0, Math.cos(Phaser.Math.DegToRad(state.boom_angle_deg))) * 5
    + Math.max(0, Math.cos(Phaser.Math.DegToRad(state.stick_angle_deg))) * 3;
  const angle = Phaser.Math.DegToRad(state.upper_heading_deg - 90);
  return {
    x_m: Phaser.Math.Clamp(state.x_m + Math.cos(angle) * reach, 0, siteData.width_m),
    y_m: Phaser.Math.Clamp(state.y_m - Math.sin(angle) * reach, 0, siteData.height_m),
  };
}

function updateReadings(): void {
  const setText = (selector: string, value: string) => { const el = root.querySelector<HTMLElement>(selector); if (el) el.textContent = value; };
  setText("#metric-speed", (Math.abs(state.speed_mps) * 3.6).toFixed(1));
  setText("#metric-rpm", Math.round(overrides.rpm ?? (state.engine_running ? 1200 + Math.abs(state.speed_mps) * 200 : 0)).toLocaleString());
  setText("#metric-fuel", state.fuel_used_l.toFixed(1)); setText("#metric-cycles", String(state.load_cycles));
  setText("#metric-heading", `${String(Math.round(state.heading_deg)).padStart(3, "0")}°`);
  setText("#metric-position", `MACHINE ${state.x_m.toFixed(1)}, ${state.y_m.toFixed(1)} M`);
  setText("#metric-load", `${state.bucket_load_m3.toFixed(2)} m³`);
  setText("#metric-boom", `${Math.round(state.boom_angle_deg)}°`); setText("#metric-stick", `${Math.round(state.stick_angle_deg)}°`);
  setText("#metric-bucket", `${Math.round(state.bucket_angle_deg)}°`); setText("#metric-swing", `${String(Math.round(state.upper_heading_deg)).padStart(3, "0")}°`);
  setText("#metric-time", `${String(Math.floor(state.elapsed_s / 60)).padStart(2, "0")}:${String(Math.floor(state.elapsed_s % 60)).padStart(2, "0")}`);
  const pendingVolume = outbox.pending().reduce((total, event) => total + event.quantity_m3, 0);
  setText("#task-amount", `${outbox.size} deposit event${outbox.size === 1 ? "" : "s"} awaiting acknowledgement · ${pendingVolume.toFixed(2)} m³ queued`);
  setText("#task-state", state.bucket_load_m3 > 0 ? "LOADED" : outbox.size > 0 ? "PENDING ACK" : taskData ? taskData.status.toUpperCase() : "NO TASK");
  setToggle("#engine-control", `ENGINE ${state.engine_running ? "ON" : "OFF"}`, state.engine_running);
  setToggle("#belt-control", `SEATBELT ${state.seatbelt_fastened ? "FASTENED" : "UNFASTENED"}`, state.seatbelt_fastened);
  setToggle("#brake-control", `PARKING BRAKE ${state.parking_brake_engaged ? "ON" : "OFF"}`, state.parking_brake_engaged);
  setText("#pause-control", paused ? "Resume simulation" : "Pause simulation");
  const machine = root.querySelector<HTMLSpanElement>("#machine-state");
  if (machine) { machine.textContent = paused ? "PAUSED" : state.engine_running ? "RUNNING" : "ENGINE OFF"; machine.className = `machine-state ${paused ? "paused" : state.engine_running ? "running" : "off"}`; }
  const overrideMark = root.querySelector<HTMLElement>("#override-mark");
  if (overrideMark) overrideMark.textContent = `${Object.keys(overrides).length} OVERRIDDEN`;
}

async function toggleSessionPause(): Promise<void> {
  if (!currentSession || !authState) { showBanner("Start a simulator session first.", true); return; }
  const action = paused ? "resume" : "pause";
  try {
    currentSession = await backend.sessionAction(authState.csrf_token, currentSession.session_id, action);
    paused = action === "pause"; previousTick = performance.now();
    if (paused) frameStream?.pause(); else frameStream?.resume();
    updateReadings();
  } catch (error) { showBanner(error instanceof Error ? error.message : "Session action failed.", true); }
}

function setToggle(selector: string, label: string, active: boolean): void {
  const button = root.querySelector<HTMLButtonElement>(selector); if (button) { button.textContent = label; button.classList.toggle("active", active); }
}
async function resetSimulation(): Promise<void> {
  if (currentSession && authState) {
    try { await backend.sessionAction(authState.csrf_token, currentSession.session_id, "end"); }
    catch (error) { showBanner(error instanceof Error ? error.message : "Could not end the current session.", true); return; }
  }
  publisher?.close(); publisher = null; currentSession = null;
  Object.assign(state, { x_m: 19, y_m: 22, heading_deg: 0, upper_heading_deg: 153.435, speed_mps: 0, boom_angle_deg: 90, stick_angle_deg: 90, bucket_angle_deg: 15, bucket_load_m3: 0, engine_running: true, seatbelt_fastened: true, parking_brake_engaged: false, fuel_used_l: 0, idle_seconds: 0, load_cycles: 0, elapsed_s: 0, deposited_m3: 0 });
  localSessionId = makeLocalSessionId(); outbox.clear(); frameStream?.reset(0); latestFrame = null;
  for (const field of Object.keys(overrides) as OverrideField[]) delete overrides[field];
  hazardStaged = false; actors.splice(0, actors.length); keys.clear(); paused = false; previousTick = performance.now(); moveActors();
  scene?.setActors(actors); scene?.setState(state); renderOverrides(); updateReadings();
  setSessionControls(false); paused = true;
  showBanner("Current session ended. Start a new simulator session to continue; history is retained.");
  updateReadings();
  if (taskData) void startSimulatorSession();
}
function showBanner(message: string, error = false): void {
  const banner = root.querySelector<HTMLDivElement>("#banner"); if (!banner) return;
  banner.textContent = message; banner.classList.remove("hidden", "error"); if (error) banner.classList.add("error");
  window.clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => banner.classList.add("hidden"), 4500);
}
function distance(a: Point, b: Point): number { return Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m); }
function normalize(degrees: number): number { return (degrees % 360 + 360) % 360; }
function makeLocalSessionId(): string { return `SIM${crypto.randomUUID().replaceAll("-", "")}`; }
function makeEventId(): string { return `WORK${crypto.randomUUID().replaceAll("-", "")}`; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!); }

function cleanup(): void {
  if (animationFrame) window.clearInterval(animationFrame);
  publisher?.close(); frameStream?.stop(); unsubscribeFrames?.();
  game?.destroy(true); game = null; scene = null;
  window.removeEventListener("keydown", keyHandler); window.removeEventListener("keyup", keyHandler); window.removeEventListener("blur", releaseKeys);
}
window.addEventListener("pagehide", cleanup);
void (async () => {
  try { authState = await backend.me(); operatorId = authState.operator.operator_id; renderShell(); }
  catch (error) { renderLogin(error instanceof BackendError && error.status !== 401 ? error.message : undefined); }
})();
