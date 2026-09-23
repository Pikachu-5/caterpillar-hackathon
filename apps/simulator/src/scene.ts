import Phaser from "phaser";
import type { Point, Site, WorldFrame } from "@cat-hub/contracts";

type MachinePose = Pick<Point, "x_m" | "y_m"> & {
  heading_deg: number; upper_heading_deg: number; boom_angle_deg: number;
  stick_angle_deg: number; bucket_angle_deg: number; bucket_load_m3: number;
};

const COLORS = { background: 0x202720, grid: 0x344036, grass: 0x303b31, restricted: 0x754c42, machine: 0xd5a339, dark: 0x252822, actor: 0xe3d4bb };

export class SiteScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private caption!: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private actors: WorldFrame["actors"] = [];
  private site!: Site;
  private state!: MachinePose;
  private pxPerMeter = 10;
  private offsetX = 28;
  private offsetY = 28;

  constructor() { super("site"); }

  create(): void {
    this.graphics = this.add.graphics();
    this.caption = this.add.text(14, 12, "SITE VIEW · METERS", { color: "#d8dfd3", fontFamily: "monospace", fontSize: "11px" }).setScrollFactor(0);
    this.pxPerMeter = Math.min((this.scale.width - 56) / 100, (this.scale.height - 56) / 100);
    this.pxPerMeter = Math.max(3, Math.min(this.pxPerMeter, 12));
    this.offsetX = Math.max(28, (this.scale.width - 100 * this.pxPerMeter) / 2);
    this.offsetY = Math.max(28, (this.scale.height - 100 * this.pxPerMeter) / 2);
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
    this.pxPerMeter = Math.min((width - 56) / this.site.width_m, (height - 56) / this.site.height_m, 12);
    this.offsetX = Math.max(28, (width - this.site.width_m * this.pxPerMeter) / 2);
    this.offsetY = Math.max(28, (height - this.site.height_m * this.pxPerMeter) / 2);
    this.positionLabels();
  }
  private point(p: Point): { x: number; y: number } { return { x: this.offsetX + p.x_m * this.pxPerMeter, y: this.offsetY + (this.site.height_m - p.y_m) * this.pxPerMeter }; }
  private angle(deg: number): number { return Phaser.Math.DegToRad(deg - 90); }

  private makeLabels(): void {
    this.labels.forEach(label => label.destroy()); this.labels = [];
    for (const destination of this.site.destinations) {
      this.labels.push(this.add.text(0, 0, destination.label, { color: "#d8dfd3", fontSize: "11px", fontFamily: "monospace" }).setDepth(1));
    }
    this.positionLabels();
  }

  private positionLabels(): void {
    this.site?.destinations.forEach((destination, index) => {
      const point = this.point(destination.position), label = this.labels[index];
      if (label) {
        const nearNeighbor = this.site.destinations.some((other, otherIndex) => otherIndex !== index &&
          Math.hypot(other.position.x_m - destination.position.x_m, other.position.y_m - destination.position.y_m) < 12);
        if (nearNeighbor && index === 0) label.setPosition(point.x - 77, point.y + 13);
        else label.setPosition(point.x + 7, point.y - (nearNeighbor ? 14 : 0));
      }
    });
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(COLORS.background, 1).fillRect(0, 0, this.scale.width, this.scale.height);
    g.fillStyle(COLORS.grass, 1).fillRect(this.offsetX, this.offsetY, this.site.width_m * this.pxPerMeter, this.site.height_m * this.pxPerMeter);
    g.lineStyle(1, COLORS.grid, 0.55);
    for (let x = 0; x <= this.site.width_m; x += 10) {
      const px = this.offsetX + x * this.pxPerMeter; g.lineBetween(px, this.offsetY, px, this.offsetY + this.site.height_m * this.pxPerMeter);
    }
    for (let y = 0; y <= this.site.height_m; y += 10) {
      const py = this.offsetY + y * this.pxPerMeter; g.lineBetween(this.offsetX, py, this.offsetX + this.site.width_m * this.pxPerMeter, py);
    }
    g.lineStyle(2, 0x667261, 1).strokeRect(this.offsetX, this.offsetY, this.site.width_m * this.pxPerMeter, this.site.height_m * this.pxPerMeter);

    for (const zone of this.site.zones) {
      if (zone.kind === "restricted") {
        const points = zone.polygon.map(point => this.point(point)); g.fillStyle(COLORS.restricted, 0.35); g.lineStyle(2, 0xd68169, 0.8);
        const first = points[0];
        if (!first) continue;
        g.beginPath(); g.moveTo(first.x, first.y); points.slice(1).forEach(point => g.lineTo(point.x, point.y)); g.closePath(); g.fillPath(); g.strokePath();
      }
    }
    for (const object of this.site.static_objects) {
      const p = this.point(object.position), r = object.radius_m * this.pxPerMeter;
      g.fillStyle(0x555b52, 1).fillCircle(p.x, p.y, r); g.lineStyle(1, 0xb1b7a8, 0.8).strokeCircle(p.x, p.y, r);
    }
    for (const destination of this.site.destinations) {
      const p = this.point(destination.position), r = destination.radius_m * this.pxPerMeter;
      g.lineStyle(2, 0xb9c9a3, 0.75).strokeCircle(p.x, p.y, r); g.fillStyle(0xc9d1bd, 1).fillCircle(p.x, p.y, 3);
    }
    for (const actor of this.actors) {
      const p = this.point(actor.position), r = Math.max(5, actor.radius_m * this.pxPerMeter);
      g.fillStyle(actor.kind === "worker" ? COLORS.actor : 0x8ab5ae, 1).fillCircle(p.x, p.y, r);
      g.lineStyle(2, 0x18201b, 1).strokeCircle(p.x, p.y, r);
    }
    this.drawMachine(g);
  }

  private drawMachine(g: Phaser.GameObjects.Graphics): void {
    const base = this.point(this.state), body = 2.5 * this.pxPerMeter;
    const travel = this.angle(this.state.heading_deg);
    g.lineStyle(2, 0xa67c28, 1).lineBetween(base.x, base.y, base.x + Math.cos(travel) * 2.2 * this.pxPerMeter, base.y + Math.sin(travel) * 2.2 * this.pxPerMeter);
    g.fillStyle(COLORS.dark, 1).fillRoundedRect(base.x - body * 1.2, base.y - body * 0.8, body * 2.4, body * 1.6, 5);
    g.lineStyle(2, COLORS.machine, 1).strokeRoundedRect(base.x - body * 1.2, base.y - body * 0.8, body * 2.4, body * 1.6, 5);
    const upper = this.angle(this.state.upper_heading_deg), tip = this.point(this.statePoint());
    const joint = { x: base.x + Math.cos(upper) * body * 0.5, y: base.y + Math.sin(upper) * body * 0.5 };
    g.lineStyle(7, 0x9c7b39, 1).lineBetween(joint.x, joint.y, tip.x, tip.y);
    g.lineStyle(3, COLORS.machine, 1).lineBetween(joint.x, joint.y, tip.x, tip.y);
    g.fillStyle(COLORS.machine, 1).fillCircle(tip.x, tip.y, 5);
    const curl = Phaser.Math.DegToRad(this.state.bucket_angle_deg + this.state.upper_heading_deg - 90);
    g.lineStyle(3, COLORS.machine, 1).lineBetween(tip.x, tip.y, tip.x + Math.cos(curl) * 8, tip.y + Math.sin(curl) * 8);
    if (this.state.bucket_load_m3 > 0) g.fillStyle(0x92714a, 1).fillCircle(tip.x, tip.y - 5, Math.min(8, 3 + this.state.bucket_load_m3 * 4));
  }

  private statePoint(): Point {
    const length = 3 + Math.max(0, Math.cos(Phaser.Math.DegToRad(this.state.boom_angle_deg))) * 5 + Math.max(0, Math.cos(Phaser.Math.DegToRad(this.state.stick_angle_deg))) * 3;
    const angle = this.angle(this.state.upper_heading_deg);
    return { x_m: this.state.x_m + Math.cos(angle) * length, y_m: this.state.y_m - Math.sin(angle) * length };
  }
}
