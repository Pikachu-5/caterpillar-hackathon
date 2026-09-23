import Phaser from "phaser";
import site from "../../../shared/fixtures/site.json";
import { SiteScene } from "./scene";
import type { Point, Site as SiteContract } from "@cat-hub/contracts";
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

const siteData = site as SiteContract;
const root = document.querySelector<HTMLDivElement>("#app")!;
const state: SimState = {
  x_m: 19, y_m: 22, heading_deg: 0, upper_heading_deg: 0, speed_mps: 0,
  boom_angle_deg: 35, stick_angle_deg: -30, bucket_angle_deg: 15,
  bucket_load_m3: 0, engine_running: true, seatbelt_fastened: true,
  parking_brake_engaged: false, fuel_used_l: 0, idle_seconds: 0,
  load_cycles: 0, elapsed_s: 0, deposited_m3: 0, engine_hours: 1523.5,
};
const actors: SiteActor[] = [];
let game: Phaser.Game | null = null;
let scene: SiteScene | null = null;
let paused = false;
let animationFrame = 0;
let previousTick = performance.now();
let keys = new Set<string>();
let bannerTimer = 0;

function renderShell(): void {
  root.innerHTML = `<div class="app-shell">
    <header class="topbar"><a class="brand" href="#"><span class="cat-badge">CAT</span><span>OPERATOR SIMULATOR</span></a><div class="top-status"><span class="status-dot live"></span><span>LOCAL SIMULATION</span><span class="divider"></span><span class="operator-label">CAT 325 · TRACKED EXCAVATOR</span></div></header>
    <main class="cockpit">
      <section class="workspace">
        <div class="section-heading"><div><p class="eyebrow">${escapeHtml(siteData.name)} · ${siteData.width_m} × ${siteData.height_m} m</p><h1>CAT 325 <span class="subheading">Site Simulator</span></h1></div><div class="source-chip"><span class="pulse"></span>LOCAL SESSION</div></div>
        <div class="viewport"><div id="sim-world"></div><div class="viewport-label"><span>LOCAL SITE COORDINATES</span><span id="metric-position">MACHINE 018, 024 M</span><span>ORIGIN SOUTHWEST · +X EAST · +Y NORTH</span></div></div>
        <div class="control-strip"><div class="switch-group"><button id="engine-control" class="toggle-button"></button><button id="belt-control" class="toggle-button"></button><button id="brake-control" class="toggle-button"></button></div><div class="action-group"><button id="pause-control" class="primary small">Pause simulation</button><button id="reset-control" class="secondary small">Reset site</button></div></div>
        <div class="key-legend"><span class="legend-title">CONTROLS</span><kbd>W</kbd><kbd>S</kbd><span>travel</span><kbd>A</kbd><kbd>D</kbd><span>tracks</span><kbd>Q</kbd><kbd>E</kbd><span>swing</span><kbd>R</kbd><kbd>F</kbd><span>boom</span><kbd>T</kbd><kbd>G</kbd><span>stick</span><kbd>Y</kbd><kbd>H</kbd><span>bucket</span><kbd>Space</kbd><span>pickup / deposit</span></div>
        <div class="banner hidden" id="banner" role="status"></div>
      </section>
      <aside class="telemetry-panel">
        <div class="panel-title"><div><p class="eyebrow">SIMULATED READINGS</p><h2>Machine status</h2></div><span id="machine-state" class="machine-state running">RUNNING</span></div>
        <div class="metric-grid"><div class="metric"><span>GROUND SPEED</span><strong id="metric-speed">0.0</strong><small>km/h</small></div><div class="metric"><span>ENGINE SPEED</span><strong id="metric-rpm">1,200</strong><small>RPM</small></div><div class="metric"><span>FUEL USED</span><strong id="metric-fuel">0.0</strong><small>L this session</small></div><div class="metric"><span>LOAD CYCLES</span><strong id="metric-cycles">0</strong><small>cycles</small></div></div>
        <div class="task-card"><div class="task-heading"><h3>Preset job · A → B</h3><span id="task-state" class="task-state">READY</span></div><strong id="task-title">Move material from A to B</strong><p id="task-route">Pickup at Material pickup · Deposit at Deposit</p><div class="progress-track"><span id="task-progress"></span></div><div id="task-amount" class="task-amount">0.00 / 5.00 m³ deposited</div><button id="work-control" class="primary work-button">Pickup / deposit material</button></div>
        <div class="task-card attachment-card"><div class="task-heading"><h3>Attachment pose</h3><span class="local-tag">SIMPLIFIED KINEMATICS</span></div><div class="pose-grid"><div><span>BOOM</span><strong id="metric-boom">35°</strong></div><div><span>STICK</span><strong id="metric-stick">−30°</strong></div><div><span>BUCKET</span><strong id="metric-bucket">15°</strong></div><div><span>UPPER BODY</span><strong id="metric-swing">000°</strong></div></div></div>
        <div class="site-facts"><div><span>HEADING</span><strong id="metric-heading">000°</strong></div><div><span>BUCKET LOAD</span><strong id="metric-load">0.00 m³</strong></div><div><span>SIM TIME</span><strong id="metric-time">00:00</strong></div></div>
        <p class="notice">All readings and movement are simulated. This is a simplified 2D demo, not a CAT machine model.</p>
      </aside>
    </main>
  </div>`;
  bindControls();
  createGame();
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
}

function bindControls(): void {
  root.querySelector<HTMLButtonElement>("#engine-control")!.onclick = () => { state.engine_running = !state.engine_running; if (!state.engine_running) state.speed_mps = 0; updateReadings(); };
  root.querySelector<HTMLButtonElement>("#belt-control")!.onclick = () => { state.seatbelt_fastened = !state.seatbelt_fastened; updateReadings(); };
  root.querySelector<HTMLButtonElement>("#brake-control")!.onclick = () => { state.parking_brake_engaged = !state.parking_brake_engaged; if (state.parking_brake_engaged) state.speed_mps = 0; updateReadings(); };
  root.querySelector<HTMLButtonElement>("#pause-control")!.onclick = () => { paused = !paused; previousTick = performance.now(); updateReadings(); };
  root.querySelector<HTMLButtonElement>("#reset-control")!.onclick = resetSimulation;
  root.querySelector<HTMLButtonElement>("#work-control")!.onclick = pickupOrDeposit;
  window.addEventListener("keydown", keyHandler);
  window.addEventListener("keyup", keyHandler);
  window.addEventListener("blur", releaseKeys);
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
  const workerX = 44 + Math.sin(t * 0.1) * 7, workerY = 52 + Math.cos(t * 0.1) * 6;
  const vehicleX = 72 + Math.cos(t * 0.065) * 8, vehicleY = 34 + Math.sin(t * 0.065) * 7;
  if (worker) Object.assign(worker, { position: { x_m: workerX, y_m: workerY }, heading_deg: normalize(t * 6), speed_kmh: 1.1 });
  else actors.push({ actor_id: "WORKER001", kind: "worker", position: { x_m: workerX, y_m: workerY }, heading_deg: normalize(t * 6), radius_m: 0.45, speed_kmh: 1.1 });
  if (vehicle) Object.assign(vehicle, { position: { x_m: vehicleX, y_m: vehicleY }, heading_deg: normalize(t * 3.5), speed_kmh: 4.5 });
  else actors.push({ actor_id: "VEHICLE001", kind: "vehicle", position: { x_m: vehicleX, y_m: vehicleY }, heading_deg: normalize(t * 3.5), radius_m: 1.2, speed_kmh: 4.5 });
}

function pickupOrDeposit(): void {
  if (paused) { showBanner("Resume the simulation before moving material.", true); return; }
  const pickup = siteData.destinations.find(destination => destination.destination_id === "DEST_A");
  const deposit = siteData.destinations.find(destination => destination.destination_id === "DEST_B");
  if (!pickup || !deposit) { showBanner("The site fixture is missing the preset A → B destinations.", true); return; }
  const atPickup = distance(state, pickup.position) <= pickup.radius_m + 1;
  const atDeposit = distance(state, deposit.position) <= deposit.radius_m + 1;
  if (state.bucket_load_m3 <= 0 && atPickup) {
    state.bucket_load_m3 = 0.5; state.boom_angle_deg = 50; state.stick_angle_deg = 0; state.bucket_angle_deg = -10;
    showBanner("Bucket loaded with 0.50 m³ of simulated material. Move to Deposit and unload.");
  } else if (state.bucket_load_m3 > 0 && atDeposit) {
    state.deposited_m3 += state.bucket_load_m3; state.load_cycles += 1; state.bucket_load_m3 = 0;
    showBanner(`Deposit added · ${state.deposited_m3.toFixed(2)} / 5.00 m³ for the local demo job.`);
  } else if (state.bucket_load_m3 > 0) showBanner("Move the excavator to the Deposit area before unloading.", true);
  else showBanner("Move the excavator into the Material pickup area to load the bucket.", true);
  updateReadings();
}

function updateReadings(): void {
  const setText = (selector: string, value: string) => { const el = root.querySelector<HTMLElement>(selector); if (el) el.textContent = value; };
  setText("#metric-speed", (Math.abs(state.speed_mps) * 3.6).toFixed(1));
  setText("#metric-rpm", Math.round(state.engine_running ? 1200 + Math.abs(state.speed_mps) * 200 : 0).toLocaleString());
  setText("#metric-fuel", state.fuel_used_l.toFixed(1)); setText("#metric-cycles", String(state.load_cycles));
  setText("#metric-heading", `${String(Math.round(state.heading_deg)).padStart(3, "0")}°`);
  setText("#metric-position", `MACHINE ${state.x_m.toFixed(1)}, ${state.y_m.toFixed(1)} M`);
  setText("#metric-load", `${state.bucket_load_m3.toFixed(2)} m³`);
  setText("#metric-boom", `${Math.round(state.boom_angle_deg)}°`); setText("#metric-stick", `${Math.round(state.stick_angle_deg)}°`);
  setText("#metric-bucket", `${Math.round(state.bucket_angle_deg)}°`); setText("#metric-swing", `${String(Math.round(state.upper_heading_deg)).padStart(3, "0")}°`);
  setText("#metric-time", `${String(Math.floor(state.elapsed_s / 60)).padStart(2, "0")}:${String(Math.floor(state.elapsed_s % 60)).padStart(2, "0")}`);
  const progress = Math.min(100, state.deposited_m3 / 5 * 100);
  const bar = root.querySelector<HTMLSpanElement>("#task-progress"); if (bar) bar.style.width = `${progress}%`;
  setText("#task-amount", `${state.deposited_m3.toFixed(2)} / 5.00 m³ deposited`);
  setText("#task-state", progress >= 100 ? "COMPLETE" : state.bucket_load_m3 > 0 ? "LOADED" : state.load_cycles > 0 ? "IN PROGRESS" : "READY");
  setToggle("#engine-control", `ENGINE ${state.engine_running ? "ON" : "OFF"}`, state.engine_running);
  setToggle("#belt-control", `SEATBELT ${state.seatbelt_fastened ? "FASTENED" : "UNFASTENED"}`, state.seatbelt_fastened);
  setToggle("#brake-control", `PARKING BRAKE ${state.parking_brake_engaged ? "ON" : "OFF"}`, state.parking_brake_engaged);
  setText("#pause-control", paused ? "Resume simulation" : "Pause simulation");
  const machine = root.querySelector<HTMLSpanElement>("#machine-state");
  if (machine) { machine.textContent = paused ? "PAUSED" : state.engine_running ? "RUNNING" : "ENGINE OFF"; machine.className = `machine-state ${paused ? "paused" : state.engine_running ? "running" : "off"}`; }
}

function setToggle(selector: string, label: string, active: boolean): void {
  const button = root.querySelector<HTMLButtonElement>(selector); if (button) { button.textContent = label; button.classList.toggle("active", active); }
}
function resetSimulation(): void {
  Object.assign(state, { x_m: 19, y_m: 22, heading_deg: 0, upper_heading_deg: 0, speed_mps: 0, boom_angle_deg: 35, stick_angle_deg: -30, bucket_angle_deg: 15, bucket_load_m3: 0, engine_running: true, seatbelt_fastened: true, parking_brake_engaged: false, fuel_used_l: 0, idle_seconds: 0, load_cycles: 0, elapsed_s: 0, deposited_m3: 0 });
  actors.splice(0, actors.length); keys.clear(); paused = false; previousTick = performance.now(); moveActors(); scene?.setActors(actors); scene?.setState(state); updateReadings(); showBanner("Local simulator reset. Session counters and the A → B job are clear.");
}
function showBanner(message: string, error = false): void {
  const banner = root.querySelector<HTMLDivElement>("#banner"); if (!banner) return;
  banner.textContent = message; banner.classList.remove("hidden", "error"); if (error) banner.classList.add("error");
  window.clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => banner.classList.add("hidden"), 4500);
}
function distance(a: Point, b: Point): number { return Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m); }
function normalize(degrees: number): number { return (degrees % 360 + 360) % 360; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!); }

function cleanup(): void {
  if (animationFrame) window.clearInterval(animationFrame);
  game?.destroy(true); game = null; scene = null;
  window.removeEventListener("keydown", keyHandler); window.removeEventListener("keyup", keyHandler); window.removeEventListener("blur", releaseKeys);
}
window.addEventListener("pagehide", cleanup);
renderShell();
