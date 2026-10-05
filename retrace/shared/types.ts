export type SourceKind = "simulation" | "fixture" | "sensor";
export type PlaybackMode = "live" | "replay";
export interface SignalEvent {
  schemaVersion: 1;
  sessionId: string;
  sensorId: string;
  sequence: number;
  capturedAt: string;
  sourceKind: SourceKind;
  rssi?: number;
  amplitudes?: number[];
  amplitudeUnit?: "relative";
}
export interface ReceivedEvent extends SignalEvent {
  receivedAt: string;
}
export type StreamMessage =
  | { type: "samples"; events: ReceivedEvent[] }
  | { type: "status"; status: "waiting" | "disconnected"; epoch: string }
  | { type: "error"; message: string };
export interface Scenario {
  id: string;
  title: string;
  description: string;
  duration: number;
  activity: string;
  accent: string;
}
