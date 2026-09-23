import Ajv2020, { type AnySchema, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { WorldFrame, WorkEvent } from "@cat-hub/contracts";

const schemaModules = import.meta.glob("../../../shared/schemas/*.schema.json", { eager: true, import: "default" });
const validator = new Ajv2020({ allErrors: true, strict: false });
addFormats(validator);
Object.values(schemaModules).forEach(schema => validator.addSchema(schema as AnySchema));
const validateFrame = validator.getSchema("https://schemas.cat-operator-hub.example/v1/world-frame.schema.json") as ValidateFunction<WorldFrame>;

export function assertWorldFrame(frame: WorldFrame): void {
  if (!validateFrame(frame)) {
    const errors = (validateFrame.errors ?? []).map(issue => `${issue.instancePath || "/"} ${issue.message ?? "is invalid"}`).join("; ");
    throw new Error(`Simulator generated a frame outside the shared schema: ${errors}`);
  }
}

export class WorkEventOutbox {
  private readonly events = new Map<string, WorkEvent>();
  constructor(readonly maxPending = 64) {}

  add(event: WorkEvent): boolean {
    const previous = this.events.get(event.event_id);
    if (previous) return JSON.stringify(previous) === JSON.stringify(event);
    if (this.events.size >= this.maxPending) return false;
    this.events.set(event.event_id, event);
    return true;
  }

  pending(): WorkEvent[] { return [...this.events.values()]; }
  acknowledge(eventIds: string[]): void { eventIds.forEach(eventId => this.events.delete(eventId)); }
  clear(): void { this.events.clear(); }
  get size(): number { return this.events.size; }
}

export class FrameStream {
  private sequence = 0;
  private timer: number | undefined;
  private paused = false;
  private listeners = new Set<(frame: WorldFrame) => void>();

  constructor(private readonly createFrame: (sequence: number) => WorldFrame, readonly periodMs = 200,
    private readonly onError: (error: unknown) => void = error => console.error(error)) {}

  subscribe(listener: (frame: WorldFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer || this.paused) return;
    this.timer = window.setInterval(() => {
      try {
        const frame = this.createFrame(this.sequence);
        assertWorldFrame(frame);
        this.sequence++;
        this.listeners.forEach(listener => listener(frame));
      } catch (error) { this.onError(error); }
    }, this.periodMs);
  }

  pause(): void {
    this.paused = true;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  resume(): void { this.paused = false; this.start(); }
  reset(nextSequence = 0): void { this.sequence = nextSequence; }
  stop(): void { this.pause(); this.listeners.clear(); }
  get nextSequence(): number { return this.sequence; }
}
