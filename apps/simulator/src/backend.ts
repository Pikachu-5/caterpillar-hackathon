import type { AuthState, Environment, RealtimeMessage, Session, SessionAction, SessionStart, Snapshot, Task, Machine, WorldFrame } from "@cat-hub/contracts";

const API = "/api/v1";

export class BackendError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: "include" });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { const error = await response.json() as { message?: string }; if (error.message) message = error.message; } catch { /* Keep the status-only message. */ }
    throw new BackendError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const backend = {
  me: () => request<AuthState>("/auth/me"),
  login: (username: string, password: string) => request<AuthState>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: (csrf: string) => request<void>("/auth/logout", { method: "POST" }, csrf),
  machines: async () => (await request<{ items: Machine[] }>("/machines?limit=100")).items,
  sessions: () => listAll<Session>("/sessions"),
  tasks: () => listAll<Task>("/tasks"),
  startSession: (csrf: string, body: SessionStart) => request<Session>("/sessions", { method: "POST", body: JSON.stringify(body) }, csrf),
  sessionAction: (csrf: string, sessionId: string, action: SessionAction["action"]) => request<Session>(`/sessions/${encodeURIComponent(sessionId)}/actions`, { method: "POST", body: JSON.stringify({ action } satisfies SessionAction) }, csrf),
  snapshot: (sessionId: string) => request<Snapshot>(`/sessions/${encodeURIComponent(sessionId)}/snapshot`),
};

async function listAll<T>(path: string): Promise<T[]> {
  const result: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await request<{ items: T[]; next_cursor: string | null }>(`${path}?${query}`);
    result.push(...page.items);
    cursor = page.next_cursor;
    if (cursor && seenCursors.has(cursor)) throw new Error("The backend repeated a pagination cursor.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return result;
}

type ConnectionCallbacks = {
  snapshot: (snapshot: Snapshot) => void;
  acknowledged: (eventIds: string[]) => void;
  environment: (environment: Environment) => void;
  session: (session: Session) => void;
  task: (task: Task) => void;
  status: (status: "connecting" | "live" | "disconnected" | "error" | "login") => void;
  error: (message: string) => void;
};

export class PublisherConnection {
  private socket: WebSocket | null = null;
  private timer = 0;
  private heartbeat = 0;
  private retry = 0;
  private closedByUser = false;
  private ready = false;
  private lastPong = Date.now();

  constructor(private readonly sessionId: string, private readonly csrf: string, private readonly callbacks: ConnectionCallbacks) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  publish(frame: WorldFrame): void {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    this.send("world_frame", frame);
  }

  close(): void {
    this.closedByUser = true;
    this.ready = false;
    window.clearTimeout(this.timer);
    window.clearInterval(this.heartbeat);
    this.socket?.close(1000, "Simulator stopped");
    this.socket = null;
  }

  private open(): void {
    if (this.closedByUser) return;
    this.callbacks.status(this.retry ? "disconnected" : "connecting");
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${location.host}/ws/v1/publisher`);
    this.socket = socket;
    socket.onopen = () => {
      this.send("publisher_hello", { session_id: this.sessionId, csrf_token: this.csrf });
      this.lastPong = Date.now();
      this.heartbeat = window.setInterval(() => {
        if (Date.now() - this.lastPong > 30_000) { socket.close(); return; }
        this.send("ping", { nonce: crypto.randomUUID() });
      }, 15_000);
    };
    socket.onmessage = event => this.receive(String(event.data));
    socket.onerror = () => this.callbacks.status("error");
    socket.onclose = event => {
      window.clearInterval(this.heartbeat);
      this.ready = false;
      if (this.closedByUser) return;
      if (event.code === 1008) { this.callbacks.status("login"); return; }
      this.callbacks.status("disconnected");
      const delay = Math.min(10_000, 1000 * 2 ** this.retry) * (0.8 + Math.random() * 0.4);
      this.retry = Math.min(this.retry + 1, 4);
      this.timer = window.setTimeout(() => this.open(), delay);
    };
  }

  private receive(raw: string): void {
    let message: RealtimeMessage;
    try { message = JSON.parse(raw) as RealtimeMessage; }
    catch { this.callbacks.error("The backend sent an unreadable realtime message."); return; }
    switch (message.type) {
      case "snapshot": this.ready = true; this.retry = 0; this.lastPong = Date.now(); this.callbacks.snapshot(message.data); this.callbacks.status("live"); break;
      case "frame_ack": this.callbacks.acknowledged(message.data.accepted_event_ids); break;
      case "environment_update": this.callbacks.environment(message.data); break;
      case "session_update": this.callbacks.session(message.data); break;
      case "task_update": this.callbacks.task(message.data); break;
      case "ping": this.send("pong", message.data); break;
      case "pong": this.lastPong = Date.now(); break;
      case "error": this.callbacks.error(message.data.message); break;
      default: break;
    }
  }

  private send(type: RealtimeMessage["type"], data: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const message = { schema_version: "1.0.0", message_id: crypto.randomUUID(), sent_at: new Date().toISOString(), type, data };
    this.socket.send(JSON.stringify(message));
  }
}
