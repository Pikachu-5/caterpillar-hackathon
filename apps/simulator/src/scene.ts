import Phaser from "phaser";
import type { Point, Site, WorldFrame } from "@cat-hub/contracts";

type MachinePose = Pick<Point, "x_m" | "y_m"> & {
  heading_deg: number; upper_heading_deg: number; boom_angle_deg: number;
  stick_angle_deg: number; bucket_angle_deg: number; bucket_load_m3: number;
};

const COLORS = {
  background: 0x171e19, ground: 0x343b30, groundEdge: 0x78806a, grid: 0x7b846d,
  track: 0x20241f, yellow: 0xe8b83d, yellowShade: 0xb98425,
  boom: 0xc18e2d, pile: 0xc88c4d, deposit: 0xe8b83d, restricted: 0xb24d3d,
  obstacle: 0x77776b, worker: 0xffdc62, vehicle: 0x8eb6b1,
};

export class SiteScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private actors: WorldFrame["actors"] = [];
  private site!: Site;
  private state!: MachinePose;
  private pxPerMeter = 10;
  private offsetX = 28;
  private offsetY = 28;
  private tooltip!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;

  constructor() { super("site"); }

  create(): void {
    this.graphics = this.add.graphics();
    this.canvas = this.game.canvas;
    this.tooltip = document.querySelector<HTMLDivElement>("#map-tooltip")!;
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.updateHover(pointer.x, pointer.y));
    this.input.on("pointerout", () => this.hideTooltip());
    this.scale.on("resize", (size: Phaser.Structs.Size) => this.resizeWorld(size.width, size.height));
  }

  configure(site: Site, state: MachinePose, actors: WorldFrame["actors"]): void {
    this.site = site; this.state = state; this.actors = actors;
    this.resizeWorld(this.scale.width, this.scale.height);
    this.makeLabels(); this.draw();
  }
  setState(state: MachinePose): void { this.state = state; }
  setActors(actors: WorldFrame["actors"]): void { this.actors = actors; }
  update(): void { if (this.site && this.state) this.draw(); }

  private resizeWorld(width: number, height: number): void {
    if (!this.site) return;
    this.pxPerMeter = Math.min((width - 64) / this.site.width_m, (height - 64) / this.site.height_m, 18);
    this.offsetX = Math.max(32, (width - this.site.width_m * this.pxPerMeter) / 2);
    this.offsetY = Math.max(32, (height - this.site.height_m * this.pxPerMeter) / 2);
    this.positionLabels();
  }
  private point(p: Point): { x: number; y: number } { return { x: this.offsetX + p.x_m * this.pxPerMeter, y: this.offsetY + (this.site.height_m - p.y_m) * this.pxPerMeter }; }
  private angle(deg: number): number { return Phaser.Math.DegToRad(deg - 90); }

  private makeLabels(): void {
    this.labels.forEach(label => label.destroy()); this.labels = [];
    for (const destination of this.site.destinations) {
      this.labels.push(this.add.text(0, 0, destination.label.toUpperCase(), {
        color: "#f1f0e7", backgroundColor: destination.destination_id === "DEST_A" ? "#56402e" : "#4d4329",
        fontSize: "10px", fontFamily: "monospace", fontStyle: "bold", padding: { left: 7, right: 7, top: 5, bottom: 5 },
      }).setDepth(3));
    }
    this.labels.push(this.add.text(0, 0, "RESTRICTED", {
      color: "#fff0df", backgroundColor: "#7e3d32", fontSize: "9px", fontFamily: "monospace", fontStyle: "bold",
      padding: { left: 7, right: 7, top: 4, bottom: 4 },
    }).setDepth(3));
    this.positionLabels();
  }

  private positionLabels(): void {
    this.site?.destinations.forEach((destination, index) => {
      const point = this.point(destination.position), label = this.labels[index];
      if (!label) return;
      // The destinations are close together in the shared site layout; outward callouts keep the icons distinct.
      if (index === 0) label.setPosition(point.x - 102, point.y + 17);
      else label.setPosition(point.x + 17, point.y - 37);
    });
    const zone = this.site?.zones.find(item => item.kind === "restricted"), zoneLabel = this.labels[2];
    if (zone && zoneLabel) {
      const points = zone.polygon.map(point => this.point(point));
      zoneLabel.setPosition(Math.min(...points.map(point => point.x)) + 8, Math.min(...points.map(point => point.y)) + 8);
    }
  }

  private draw(): void {
    const g = this.graphics;
    const w = this.site.width_m * this.pxPerMeter, h = this.site.height_m * this.pxPerMeter;
    g.clear();
    g.fillStyle(COLORS.background, 1).fillRect(0, 0, this.scale.width, this.scale.height);
    g.fillStyle(COLORS.ground, 1).fillRoundedRect(this.offsetX - 8, this.offsetY - 8, w + 16, h + 16, 6);
    g.fillStyle(0x41483a, 1).fillRect(this.offsetX, this.offsetY, w, h);

    // Survey lines keep scale legible without competing with machine and site markers.
    g.lineStyle(1, COLORS.grid, 0.20);
    for (let x = 0; x <= this.site.width_m; x += 10) {
      const px = this.offsetX + x * this.pxPerMeter;
      g.lineBetween(px, this.offsetY, px, this.offsetY + h);
    }
    for (let y = 0; y <= this.site.height_m; y += 10) {
      const py = this.offsetY + y * this.pxPerMeter;
      g.lineBetween(this.offsetX, py, this.offsetX + w, py);
    }
    g.lineStyle(2, COLORS.groundEdge, 0.85).strokeRect(this.offsetX, this.offsetY, w, h);

    for (const zone of this.site.zones) {
      if (zone.kind !== "restricted") continue;
      const points = zone.polygon.map(point => this.point(point));
      const first = points[0]; if (!first) continue;
      g.fillStyle(COLORS.restricted, 0.30).lineStyle(2, 0xe07a5f, 0.95);
      g.beginPath(); g.moveTo(first.x, first.y); points.slice(1).forEach(point => g.lineTo(point.x, point.y)); g.closePath(); g.fillPath(); g.strokePath();
      // Diagonal hazard marks make the large keep-out zone readable at a glance.
      const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
      const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
      g.lineStyle(2, 0xe5a083, 0.42);
      for (let x = left + 8; x < right - 8; x += 16) {
        for (let y = top + 8; y < bottom - 8; y += 24) g.lineBetween(x, y + 8, x + 8, y);
      }
    }

    for (const object of this.site.static_objects) this.drawObstacle(g, object.position, object.radius_m);
    for (const destination of this.site.destinations) this.drawDestination(g, destination);
    for (const actor of this.actors) this.drawActor(g, actor);
    this.drawMachine(g);
  }

  private drawDestination(g: Phaser.GameObjects.Graphics, destination: Site["destinations"][number]): void {
    const p = this.point(destination.position), r = Math.max(12, destination.radius_m * this.pxPerMeter);
    const pickup = destination.destination_id === "DEST_A", color = pickup ? COLORS.pile : COLORS.deposit;
    g.fillStyle(color, 0.13).fillCircle(p.x, p.y, r);
    g.lineStyle(2, color, 0.88).strokeCircle(p.x, p.y, r);
    if (pickup) {
      // A small material pile inside the pickup zone.
      g.fillStyle(0x9f6839, 1).fillPoints([
        { x: p.x - 9, y: p.y + 5 }, { x: p.x - 5, y: p.y - 3 }, { x: p.x, y: p.y - 8 },
        { x: p.x + 6, y: p.y - 2 }, { x: p.x + 10, y: p.y + 5 },
      ], true);
      g.lineStyle(2, 0xf2c98b, 0.8).lineBetween(p.x - 9, p.y + 6, p.x + 10, p.y + 6);
    } else {
      // The striped pad is intentionally unlike the material pile.
      g.fillStyle(0x67522b, 1).fillRoundedRect(p.x - 9, p.y - 9, 18, 18, 3);
      g.lineStyle(2, 0xf6da89, 1).strokeRoundedRect(p.x - 9, p.y - 9, 18, 18, 3);
      g.lineStyle(2, 0xf6da89, 0.9).lineBetween(p.x - 5, p.y, p.x + 5, p.y);
      g.lineBetween(p.x, p.y - 5, p.x, p.y + 5);
    }
    // Leader strokes tie nearby callout text back to the exact zone.
    const label = this.labels[destination.destination_id === "DEST_A" ? 0 : 1];
    if (label) {
      const anchor = destination.destination_id === "DEST_A"
        ? { x: label.x + label.width, y: label.y + label.height / 2 }
        : { x: label.x, y: label.y + label.height / 2 };
      g.lineStyle(1, color, 0.75).lineBetween(p.x, p.y, anchor.x, anchor.y);
      g.fillStyle(color, 1).fillCircle(p.x, p.y, 2.5);
    }
  }

  private drawObstacle(g: Phaser.GameObjects.Graphics, position: Point, radiusM: number): void {
    const p = this.point(position), half = Math.max(7, radiusM * this.pxPerMeter * 0.65);
    g.fillStyle(0x242822, 0.35).fillEllipse(p.x + 3, p.y + 5, half * 2.3, half * 1.7);
    g.fillStyle(COLORS.obstacle, 1).fillRoundedRect(p.x - half, p.y - half, half * 2, half * 2, 3);
    g.lineStyle(2, 0xa8aa9b, 0.95).strokeRoundedRect(p.x - half, p.y - half, half * 2, half * 2, 3);
    g.lineStyle(2, 0x44483e, 0.95).lineBetween(p.x - half + 4, p.y - half + 4, p.x + half - 4, p.y + half - 4);
    g.lineBetween(p.x + half - 4, p.y - half + 4, p.x - half + 4, p.y + half - 4);
  }

  private drawActor(g: Phaser.GameObjects.Graphics, actor: WorldFrame["actors"][number]): void {
    const p = this.point(actor.position), r = Math.max(6, actor.radius_m * this.pxPerMeter * 0.8);
    if (actor.kind === "worker") {
      g.fillStyle(0x272c25, 0.4).fillCircle(p.x + 2, p.y + 3, r + 2);
      g.fillStyle(COLORS.worker, 1).fillCircle(p.x, p.y, r);
      g.lineStyle(2, 0x25291f, 1).strokeCircle(p.x, p.y, r);
      g.fillStyle(0x373c33, 1).fillCircle(p.x, p.y, Math.max(2, r * 0.27));
    } else {
      g.fillStyle(0x252a24, 1).fillRoundedRect(p.x - r * 1.25, p.y - r * 0.8, r * 2.5, r * 1.6, 3);
      g.lineStyle(1.5, COLORS.vehicle, 1).strokeRoundedRect(p.x - r * 1.25, p.y - r * 0.8, r * 2.5, r * 1.6, 3);
      g.fillStyle(COLORS.vehicle, 1).fillRoundedRect(p.x - r * 0.45, p.y - r * 0.55, r * 0.9, r * 1.1, 2);
    }
  }

  private drawMachine(g: Phaser.GameObjects.Graphics): void {
    const base = this.point(this.state), px = this.pxPerMeter;
    const travel = this.angle(this.state.heading_deg), forward = this.angle(this.state.upper_heading_deg);
    const baseCenter = { x: base.x + Math.cos(travel) * px * 0.4, y: base.y + Math.sin(travel) * px * 0.4 };
    const tracks = this.orientedRect(baseCenter, travel, px * 4.7, px * 2.35);
    g.fillStyle(0x171a17, 0.35).fillPoints(tracks.map(p => ({ x: p.x + 2, y: p.y + 3 })), true);
    g.fillStyle(COLORS.track, 1).fillPoints(tracks, true);
    g.lineStyle(2, 0x858274, 0.95).strokePoints(tracks, true);
    for (const side of [-1, 1]) {
      const normal = travel + Math.PI / 2;
      const c = { x: baseCenter.x + Math.cos(normal) * side * px * 0.73, y: baseCenter.y + Math.sin(normal) * side * px * 0.73 };
      for (const along of [-1.45, -0.5, 0.5, 1.45]) {
        const wheel = { x: c.x + Math.cos(travel) * along * px, y: c.y + Math.sin(travel) * along * px };
        g.fillStyle(0x67685d, 1).fillCircle(wheel.x, wheel.y, Math.max(2, px * 0.22));
      }
    }

    const turret = this.orientedRect(base, forward, px * 3.8, px * 2.65);
    g.fillStyle(COLORS.yellowShade, 1).fillPoints(turret.map(p => ({ x: p.x + 1.5, y: p.y + 2 })), true);
    g.fillStyle(COLORS.yellow, 1).fillPoints(turret, true);
    g.lineStyle(2, 0xffda74, 0.95).strokePoints(turret, true);

    const norm = forward + Math.PI / 2;
    const cab = { x: base.x - Math.cos(norm) * px * 0.52, y: base.y - Math.sin(norm) * px * 0.52 };
    const cabShape = this.orientedRect(cab, forward, px * 1.35, px * 1.58);
    g.fillStyle(0x323a36, 1).fillPoints(cabShape, true);
    g.lineStyle(1.5, 0xd5d8c8, 0.85).strokePoints(cabShape, true);
    const glass = { x: cab.x + Math.cos(forward) * px * 0.36, y: cab.y + Math.sin(forward) * px * 0.36 };
    g.fillStyle(0x9db7ad, 0.95).fillCircle(glass.x, glass.y, Math.max(2, px * 0.28));

    const tip = this.point(this.statePoint());
    const shoulder = { x: base.x + Math.cos(forward) * px * 0.65, y: base.y + Math.sin(forward) * px * 0.65 };
    const elbow = { x: shoulder.x + (tip.x - shoulder.x) * 0.50, y: shoulder.y + (tip.y - shoulder.y) * 0.50 - Math.sin(forward) * px * 0.3 };
    g.lineStyle(px * 0.9, 0x795b2b, 1).lineBetween(shoulder.x, shoulder.y, elbow.x, elbow.y);
    g.lineStyle(px * 0.59, COLORS.boom, 1).lineBetween(shoulder.x, shoulder.y, elbow.x, elbow.y);
    g.lineStyle(px * 0.68, 0x755b30, 1).lineBetween(elbow.x, elbow.y, tip.x, tip.y);
    g.lineStyle(px * 0.39, 0xd5a53d, 1).lineBetween(elbow.x, elbow.y, tip.x, tip.y);
    g.fillStyle(0x343831, 1).fillCircle(shoulder.x, shoulder.y, px * 0.47);
    g.lineStyle(2, 0xf2cb68, 1).strokeCircle(shoulder.x, shoulder.y, px * 0.47);
    g.fillStyle(0x47473b, 1).fillCircle(elbow.x, elbow.y, px * 0.34);
    g.lineStyle(2, 0xe1b94e, 1).strokeCircle(elbow.x, elbow.y, px * 0.34);
    g.fillStyle(COLORS.yellow, 1).fillCircle(tip.x, tip.y, Math.max(3, px * 0.22));
    const curl = Phaser.Math.DegToRad(this.state.bucket_angle_deg + this.state.upper_heading_deg - 90);
    const bucketEnd = { x: tip.x + Math.cos(curl) * px * 0.8, y: tip.y + Math.sin(curl) * px * 0.8 };
    g.lineStyle(px * 0.28, COLORS.yellowShade, 1).lineBetween(tip.x, tip.y, bucketEnd.x, bucketEnd.y);
    g.lineStyle(2, 0xf5d47c, 1).lineBetween(bucketEnd.x, bucketEnd.y,
      bucketEnd.x + Math.cos(curl + 0.7) * px * 0.42, bucketEnd.y + Math.sin(curl + 0.7) * px * 0.42);
    if (this.state.bucket_load_m3 > 0) g.fillStyle(COLORS.pile, 1).fillCircle(tip.x, tip.y - px * 0.25, Math.min(px * 0.55, 3 + this.state.bucket_load_m3 * 4));
  }

  private orientedRect(center: { x: number; y: number }, angle: number, length: number, width: number): { x: number; y: number }[] {
    const fx = Math.cos(angle), fy = Math.sin(angle), nx = -fy, ny = fx;
    return [
      { x: center.x + fx * length / 2 + nx * width / 2, y: center.y + fy * length / 2 + ny * width / 2 },
      { x: center.x - fx * length / 2 + nx * width / 2, y: center.y - fy * length / 2 + ny * width / 2 },
      { x: center.x - fx * length / 2 - nx * width / 2, y: center.y - fy * length / 2 - ny * width / 2 },
      { x: center.x + fx * length / 2 - nx * width / 2, y: center.y + fy * length / 2 - ny * width / 2 },
    ];
  }

  private updateHover(x: number, y: number): void {
    if (!this.site || !this.state || !this.tooltip || !this.canvas) return;
    const meters = { x_m: (x - this.offsetX) / this.pxPerMeter, y_m: this.site.height_m - (y - this.offsetY) / this.pxPerMeter };
    const hit = this.describeFeature(meters);
    if (!hit) { this.hideTooltip(); return; }
    const canvasRect = this.canvas.getBoundingClientRect(), viewportRect = this.canvas.parentElement?.getBoundingClientRect();
    if (!viewportRect) return;
    this.tooltip.textContent = hit;
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${Math.min(viewportRect.width - 175, canvasRect.left - viewportRect.left + x + 14)}px`;
    this.tooltip.style.top = `${Math.max(10, Math.min(viewportRect.height - 40, canvasRect.top - viewportRect.top + y - 15))}px`;
    this.canvas.style.cursor = "help";
  }

  private describeFeature(p: Point): string | null {
    for (const destination of this.site.destinations) {
      if (Math.hypot(p.x_m - destination.position.x_m, p.y_m - destination.position.y_m) <= Math.max(destination.radius_m, 3.5)) return destination.label;
    }
    for (const actor of this.actors) {
      if (Math.hypot(p.x_m - actor.position.x_m, p.y_m - actor.position.y_m) <= Math.max(actor.radius_m, 1.5)) return actor.kind === "worker" ? "Site worker" : "Support vehicle";
    }
    for (const object of this.site.static_objects) {
      if (Math.hypot(p.x_m - object.position.x_m, p.y_m - object.position.y_m) <= object.radius_m + 0.7) return "Fixed site obstacle";
    }
    for (const zone of this.site.zones) {
      if (zone.kind === "restricted" && this.insidePolygon(p, zone.polygon)) return zone.name;
    }
    const machineDistance = Math.hypot(p.x_m - this.state.x_m, p.y_m - this.state.y_m);
    if (machineDistance <= 4.3) return "CAT 325 excavator";
    const tip = this.statePoint();
    if (Math.hypot(p.x_m - tip.x_m, p.y_m - tip.y_m) <= 1.5) return "Bucket and attachment";
    return null;
  }

  private insidePolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!, b = polygon[j]!;
      if ((a.y_m > point.y_m) !== (b.y_m > point.y_m) && point.x_m < (b.x_m - a.x_m) * (point.y_m - a.y_m) / (b.y_m - a.y_m) + a.x_m) inside = !inside;
    }
    return inside;
  }

  private hideTooltip(): void {
    if (this.tooltip) this.tooltip.hidden = true;
    if (this.canvas) this.canvas.style.cursor = "default";
  }

  private statePoint(): Point {
    const length = 3 + Math.max(0, Math.cos(Phaser.Math.DegToRad(this.state.boom_angle_deg))) * 5 + Math.max(0, Math.cos(Phaser.Math.DegToRad(this.state.stick_angle_deg))) * 3;
    const angle = this.angle(this.state.upper_heading_deg);
    return {
      x_m: Phaser.Math.Clamp(this.state.x_m + Math.cos(angle) * length, 0, this.site.width_m),
      y_m: Phaser.Math.Clamp(this.state.y_m - Math.sin(angle) * length, 0, this.site.height_m),
    };
  }
}
