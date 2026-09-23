/* Generated from shared/schemas. Do not edit; run npm run contracts:generate. */

export type HistoricalOperation = {
  timestamp: string;
  machine_id: string;
  operator_id: string;
  engine_hours: number;
  fuel_used_l: number;
  load_cycles: number;
  idling_time_min: number;
  seatbelt_status: "Fastened" | "Unfastened";
  safety_alert_triggered: "Yes" | "No";
  provenance: "provided_sample" | "synthetic";
  machine_model?: "CAT 325";
  air_temperature_c?: number;
  soil_type?: "Sand" | "Loam" | "Clay" | "Gravel" | "Unknown";
  soil_moisture_percent_vwc?: number;
  interval_minutes?: number;
  timezone?: string;
  generator_version?: string;
  generation_seed?: number;
};
export type HistoricalTask = {
  task_id: string;
  task_type: "Earth Excavation" | "Trenching" | "Material Loading" | "Grading" | "Demolition";
  weather: "Sunny" | "Rainy" | "Cloudy" | "Windy";
  operator_skill: "Beginner" | "Intermediate" | "Expert";
  machine_age_years: number;
  estimated_minutes: number;
  actual_minutes: number;
  provenance: "provided_sample" | "synthetic";
  air_temperature_c?: number;
  soil_type?: "Sand" | "Loam" | "Clay" | "Gravel" | "Unknown";
  soil_moisture_percent_vwc?: number;
  machine_id?: string;
  operator_id?: string;
  started_at?: string;
  generator_version?: string;
  generation_seed?: number;
};
export type RealtimeMessage =
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "subscribe";
      data: {
        session_id: string;
      };
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "publisher_hello";
      data: {
        session_id: string;
        csrf_token: string;
      };
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "world_frame";
      data: WorldFrame;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "frame_ack";
      data: {
        session_id: string;
        sequence: number;
        /**
         * @maxItems 10000
         */
        accepted_event_ids: string[];
      };
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "snapshot";
      data: Snapshot;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "safety_event";
      data: SafetyEvent;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "task_update";
      data: Task;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "insight";
      data: Insight;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "prediction";
      data: Prediction;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "environment_update";
      data: Environment;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "session_update";
      data: Session;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "stream_status";
      data: {
        session_id: string;
        status: "waiting" | "live" | "paused" | "stale" | "disconnected";
        last_sequence: number | null;
      };
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "error";
      data: Error;
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "ping";
      data: {
        nonce: string;
      };
    }
  | {
      schema_version: "1.0.0";
      message_id: string;
      sent_at: string;
      type: "pong";
      data: {
        nonce: string;
      };
    };

export interface Contracts {
  environment?: Environment;
  telemetry?: Telemetry;
  site?: Site;
  work_event?: WorkEvent;
  world_frame?: WorldFrame;
  operator?: Operator;
  machine?: Machine;
  session?: Session;
  task?: Task;
  safety_event?: SafetyEvent;
  incident?: Incident;
  insight?: Insight;
  prediction?: Prediction;
  training?: TrainingModule;
  assistant_response?: AssistantResponse;
  historical_operation?: HistoricalOperation;
  historical_task?: HistoricalTask;
  message?: RealtimeMessage;
  api_Error?: Error;
  api_Register?: Register;
  api_Login?: Login;
  api_AuthState?: AuthState;
  api_TaskWrite?: TaskWrite;
  api_TaskEdit?: TaskEdit;
  api_TaskAction?: TaskAction;
  api_TaskOrder?: TaskOrder;
  api_SessionStart?: SessionStart;
  api_SessionAction?: SessionAction;
  api_WeatherSettings?: WeatherSettings;
  api_Scenario?: Scenario;
  api_DemoControl?: DemoControl;
  api_QuizAttempt?: QuizAttempt;
  api_QuizResult?: QuizResult;
  api_AssistantRequest?: AssistantRequest;
  api_Health?: Health;
  api_Snapshot?: Snapshot;
}
export interface Environment {
  environment_id: string;
  weather_mode: "demo" | "live";
  weather_status: "fresh" | "stale" | "unavailable";
  weather: "Sunny" | "Rainy" | "Cloudy" | "Windy" | "Unknown";
  air_temperature_c: number | null;
  precipitation_mm_h: number | null;
  wind_speed_kmh: number | null;
  observed_at: string | null;
  fetched_at: string | null;
  weather_provider: "demo" | "open_meteo";
  weather_code: number | null;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  soil_type: "Sand" | "Loam" | "Clay" | "Gravel" | "Unknown";
  soil_moisture_percent_vwc: number | null;
  soil_source: "demo" | "operator_input" | "unknown";
  terrain: "firm" | "mud" | "sand" | "rock" | "unknown";
  extensions?: Extensions;
}
/**
 * Reserved for coordinated optional metadata; never reinterpret required fields.
 */
export interface Extensions {}
export interface Telemetry {
  machine_id: string;
  operator_id: string;
  machine_model: "CAT 325";
  position: Point;
  heading_deg: number;
  speed_kmh: number;
  engine_running: boolean;
  engine_hours: number;
  rpm: number;
  throttle_percent: number;
  fuel_percent: number | null;
  fuel_used_l_session: number;
  engine_temperature_c: number | null;
  hydraulic_pressure_psi: number | null;
  hydraulic_temperature_c: number | null;
  load_percent: number;
  idle_time_s_session: number;
  load_cycles_session: number;
  seatbelt_fastened: boolean;
  operator_present: boolean;
  parking_brake_engaged: boolean;
  attachment: {
    type: "bucket";
    upper_body_heading_deg: number;
    boom_angle_deg: number;
    stick_angle_deg: number;
    bucket_angle_deg: number;
    bucket_tip_position: Point;
    bucket_tip_height_m: number;
    bucket_load_m3: number;
    footprint_radius_m: number;
    arm_safety_radius_m: number;
  };
  overridden_fields: (
    | "rpm"
    | "throttle_percent"
    | "fuel_percent"
    | "engine_temperature_c"
    | "hydraulic_pressure_psi"
    | "hydraulic_temperature_c"
    | "load_percent"
  )[];
  extensions?: Extensions;
}
export interface Point {
  x_m: number;
  y_m: number;
}
export interface Site {
  schema_version: "1.0.0";
  site_id: string;
  revision: number;
  name: string;
  width_m: number;
  height_m: number;
  coordinate_system: "local_meters_east_north";
  /**
   * @maxItems 10000
   */
  zones: {
    zone_id: string;
    name: string;
    kind: "restricted" | "work" | "pickup" | "dropoff" | "terrain";
    /**
     * @minItems 3
     */
    polygon: [Point, Point, Point, ...Point[]];
    terrain: "firm" | "mud" | "sand" | "rock" | "unknown";
  }[];
  /**
   * @maxItems 10000
   */
  static_objects: {
    object_id: string;
    kind: "obstacle";
    position: Point;
    radius_m: number;
  }[];
  /**
   * @maxItems 10000
   */
  destinations: {
    destination_id: string;
    label: string;
    position: Point;
    radius_m: number;
  }[];
}
export interface WorkEvent {
  event_id: string;
  task_id: string;
  kind: "material_deposited";
  destination_id: string;
  quantity_m3: number;
  simulation_time_s: number;
}
export interface WorldFrame {
  schema_version: "1.0.0";
  session_id: string;
  site_id: string;
  site_revision: number;
  sequence: number;
  timestamp: string;
  simulation_time_s: number;
  environment_id: string;
  telemetry: Telemetry;
  /**
   * @maxItems 10000
   */
  actors: {
    actor_id: string;
    kind: "worker" | "vehicle";
    position: Point;
    heading_deg: number;
    radius_m: number;
    speed_kmh: number;
  }[];
  /**
   * @maxItems 10000
   */
  work_events: WorkEvent[];
}
export interface Operator {
  operator_id: string;
  username: string;
  display_name: string;
  skill_level: "Beginner" | "Intermediate" | "Expert";
  created_at: string;
}
export interface Machine {
  machine_id: string;
  model: "CAT 325";
  machine_type: "excavator";
  undercarriage: "tracked";
  machine_age_years: number;
  manual_document_id: string;
  manual_serial_prefix: "TEL";
  simulated: true;
}
export interface Session {
  session_id: string;
  operator_id: string;
  machine_id: string;
  site_id: string;
  source: "demo" | "replay" | "simulator";
  status: "active" | "paused" | "ended" | "disconnected";
  started_at: string;
  ended_at: string | null;
  latest_sequence: number | null;
  environment_id: string;
}
export interface Task {
  task_id: string;
  operator_id: string;
  machine_id: string;
  title: string;
  task_type: "Earth Excavation" | "Trenching" | "Material Loading" | "Grading" | "Demolition";
  scheduled_date: string;
  order_index: number;
  status: "scheduled" | "active" | "paused" | "completed" | "cancelled";
  site_id: string;
  source_destination_id: string | null;
  target_destination_id: string | null;
  target_quantity_m3: number | null;
  completed_quantity_m3: number;
  progress_percent: number;
  progress_mode: "material_volume" | "manual";
  estimated_minutes: number | null;
  remaining_minutes: number | null;
  actual_minutes: number | null;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface SafetyEvent {
  alert_id: string;
  incident_id: string;
  session_id: string;
  machine_id: string;
  operator_id: string;
  rule_id: string;
  rule_version: string;
  type:
    | "seatbelt"
    | "proximity"
    | "restricted_zone"
    | "overspeed"
    | "engine_temperature"
    | "hydraulic_temperature"
    | "hydraulic_pressure"
    | "working_conditions"
    | "data_quality";
  severity: "info" | "warning" | "critical";
  status: "active" | "resolved";
  message: string;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  position: Point | null;
  subject_id: string | null;
  /**
   * @maxItems 10000
   */
  evidence: {
    metric: string;
    value: number | null;
    unit: string;
    threshold: number | null;
  }[];
  action: "warn_only";
}
export interface Incident {
  incident_id: string;
  operator_id: string;
  session_id: string;
  alert: SafetyEvent;
  duration_s: number;
  minimum_distance_m: number | null;
  resolution_reason: ("condition_cleared" | "session_ended" | "source_lost") | null;
}
export interface Insight {
  insight_id: string;
  operator_id: string;
  session_id: string;
  kind: "excessive_idling" | "unusual_usage" | "unsafe_pattern";
  summary: string;
  severity: "info" | "warning" | "critical";
  observed_at: string;
  /**
   * @maxItems 10000
   */
  evidence: {
    metric: string;
    observed_value: number;
    baseline_value: number | null;
    unit: string;
  }[];
  method: "rule" | "statistical" | "isolation_forest";
  model_version: string | null;
  synthetic_basis: boolean;
}
export interface Prediction {
  task_id: string;
  estimated_total_minutes: number;
  remaining_minutes: number;
  interval_lower_minutes: number | null;
  interval_upper_minutes: number | null;
  interval_coverage: number | null;
  method: "baseline" | "regression";
  model_version: string;
  synthetic_basis: true;
  /**
   * @maxItems 10000
   */
  explanation_factors: string[];
  computed_at: string;
}
export interface TrainingModule {
  module_id: string;
  title: string;
  estimated_minutes: number;
  reason: string | null;
  /**
   * @maxItems 10000
   */
  related_incident_ids: string[];
  content_markdown: string;
  /**
   * @maxItems 10000
   */
  questions: {
    question_id: string;
    prompt: string;
    /**
     * @minItems 2
     */
    choices: [
      {
        choice_id: string;
        text: string;
      },
      {
        choice_id: string;
        text: string;
      },
      ...{
        choice_id: string;
        text: string;
      }[]
    ];
  }[];
  status: "not_started" | "in_progress" | "completed";
  best_score_percent: number | null;
  completed_at: string | null;
  /**
   * @maxItems 10000
   */
  document_ids: string[];
}
export interface AssistantResponse {
  answer_id: string;
  status: "answered" | "insufficient_evidence" | "unavailable";
  answer: string;
  /**
   * @maxItems 10000
   */
  citations: {
    document_id: string;
    title: string;
    edition: string;
    page: number;
    url: string;
    excerpt: string;
  }[];
  model: string | null;
  created_at: string;
}
export interface Snapshot {
  session: Session | null;
  site: Site | null;
  environment: Environment | null;
  latest_frame: WorldFrame | null;
  /**
   * @maxItems 10000
   */
  active_alerts: SafetyEvent[];
  /**
   * @maxItems 10000
   */
  tasks: Task[];
  /**
   * @maxItems 10000
   */
  insights: Insight[];
  data_status: "waiting" | "live" | "paused" | "stale" | "disconnected";
}
export interface Error {
  code:
    | "validation_error"
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "provider_unavailable"
    | "internal_error";
  message: string;
  request_id: string;
}
export interface Register {
  username: string;
  password: string;
  display_name: string;
  skill_level: "Beginner" | "Intermediate" | "Expert";
}
export interface Login {
  username: string;
  password: string;
}
export interface AuthState {
  operator: Operator;
  csrf_token: string;
}
export interface TaskWrite {
  title: string;
  task_type: "Earth Excavation" | "Trenching" | "Material Loading" | "Grading" | "Demolition";
  machine_id: string;
  scheduled_date: string;
  site_id: string;
  source_destination_id: string | null;
  target_destination_id: string | null;
  target_quantity_m3: number | null;
  progress_mode: "material_volume" | "manual";
}
export interface TaskEdit {
  expected_revision: number;
  task: TaskWrite;
}
export interface TaskAction {
  expected_revision: number;
  action: "start" | "pause" | "resume" | "complete" | "cancel";
}
export interface TaskOrder {
  scheduled_date: string;
  tasks: {
    task_id: string;
    expected_revision: number;
  }[];
}
export interface SessionStart {
  machine_id: string;
  site_id: string;
  source: "demo" | "replay" | "simulator";
  scenario_id: string | null;
}
export interface SessionAction {
  action: "pause" | "resume" | "end";
}
export interface WeatherSettings {
  mode: "demo" | "live";
  location: {
    latitude: number;
    longitude: number;
  } | null;
  demo_weather: "Sunny" | "Rainy" | "Cloudy" | "Windy";
  air_temperature_c: number;
  precipitation_mm_h: number;
  wind_speed_kmh: number;
  soil_type: "Sand" | "Loam" | "Clay" | "Gravel" | "Unknown";
  soil_moisture_percent_vwc: number;
  terrain: "firm" | "mud" | "sand" | "rock" | "unknown";
}
export interface Scenario {
  scenario_id: string;
  title: string;
  description: string;
}
export interface DemoControl {
  scenario_id: string;
  event: "reset" | "worker_approach" | "seatbelt_off" | "overheat" | "clear_faults";
  overrides: {
    rpm?: number | null;
    throttle_percent?: number | null;
    fuel_percent?: number | null;
    engine_temperature_c?: number | null;
    hydraulic_pressure_psi?: number | null;
    hydraulic_temperature_c?: number | null;
    load_percent?: number | null;
  };
}
export interface QuizAttempt {
  /**
   * @maxItems 10000
   */
  answers: {
    question_id: string;
    choice_id: string;
  }[];
}
export interface QuizResult {
  module_id: string;
  score_percent: number;
  passed: boolean;
  /**
   * @maxItems 10000
   */
  feedback: string[];
  completed_at: string | null;
}
export interface AssistantRequest {
  question: string;
  machine_id: string;
  session_id: string | null;
}
export interface Health {
  status: "ok";
  contract_version: "1.0.0";
}
