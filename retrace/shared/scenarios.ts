import type { Scenario } from "./types";
export const scenarios: Scenario[] = [
  {
    id: "movement",
    title: "Room walkthrough",
    description: "Follow an illustrated path through a changing signal field.",
    duration: 48,
    activity: "Movement",
    accent: "#a8e9dd",
  },
  {
    id: "empty",
    title: "An empty room",
    description:
      "A quiet baseline. Small fluctuations without an activity event.",
    duration: 48,
    activity: "Baseline",
    accent: "#9baaa5",
  },
  {
    id: "entry",
    title: "A moment of arrival",
    description: "Compare a quiet baseline with a simulated room entry.",
    duration: 48,
    activity: "Entry",
    accent: "#d7e9a0",
  },
  {
    id: "stillness",
    title: "Finding stillness",
    description: "An illustrated subject settles while the signal stabilizes.",
    duration: 48,
    activity: "Stillness",
    accent: "#b5b9ee",
  },
  {
    id: "exit",
    title: "Leaving a trace",
    description: "Watch a simulated departure and the return to baseline.",
    duration: 48,
    activity: "Exit",
    accent: "#e4bf91",
  },
];
export interface ScenarioSample {
  time: number;
  rssi: number;
  amplitudes: number[];
  activity: number;
  position: { x: number; z: number } | null;
  phase: string;
  sourceKind: "simulation";
}
export function sampleScenario(id: string, time: number): ScenarioSample {
  const t = Math.max(0, Math.min(48, time));
  let activity = 0,
    phase = "Quiet baseline",
    position: ScenarioSample["position"] = null;
  const p = t / 48;
  if (id === "movement") {
    activity =
      t < 5 ? 0.025 : t > 42 ? 0.06 : 0.35 + 0.27 * Math.sin(t * 0.47) ** 2;
    phase =
      t < 5
        ? "Quiet baseline"
        : t < 12
          ? "Entry illustrated"
          : t < 37
            ? "Movement illustrated"
            : t < 43
              ? "Settling"
              : "Return to baseline";
    if (t >= 5 && t <= 43) {
      const q = (t - 5) / 38;
      position = { x: -2.65 + 5.1 * q, z: 0.6 - 1.8 * Math.sin(q * Math.PI) };
    }
  } else if (id === "entry") {
    activity = 0.03 + 0.65 * Math.exp(-(((t - 15) / 4) ** 2));
    phase =
      t < 10 ? "Quiet baseline" : t < 22 ? "Entry illustrated" : "Room settles";
    if (t >= 10) position = { x: -3 + Math.min(1, (t - 10) / 12) * 3, z: 1.05 };
  } else if (id === "stillness") {
    activity = t < 20 ? 0.45 * Math.exp(-t / 16) : 0.055;
    phase = t < 20 ? "Movement slows" : "Stillness illustrated";
    position = { x: Math.min(0, -2.5 + t * 0.16), z: -0.6 };
  } else if (id === "exit") {
    activity = 0.03 + 0.56 * Math.exp(-(((t - 31) / 5) ** 2));
    phase =
      t < 22
        ? "Quiet presence illustrated"
        : t < 37
          ? "Exit illustrated"
          : "Quiet baseline";
    if (t < 37)
      position = { x: Math.min(0, Math.max(-2.8, -(t - 22) * 0.19)), z: 1.15 };
  }
  const wave = Math.sin(t * 1.8) * 0.48 + Math.cos(t * 0.73) * 0.32;
  const rssi = -61.8 + wave + activity * (Math.sin(t * 3.1) * 2.9 - 4.2);
  const amplitudes = Array.from({ length: 32 }, (_, i) =>
    Math.max(
      0.02,
      0.35 +
        0.2 * Math.sin(i * 0.38) +
        0.085 * Math.sin(t * 1.5 + i * 0.23) +
        activity * 0.45 * Math.sin(i * 0.68 + t * 2.1),
    ),
  );
  return {
    time: t,
    rssi: Number(rssi.toFixed(2)),
    amplitudes,
    activity,
    position,
    phase,
    sourceKind: "simulation",
  };
}
export function signalHistory(
  id: string,
  time: number,
  seconds = 12,
  count = 100,
) {
  return Array.from({ length: count }, (_, i) =>
    sampleScenario(
      id,
      Math.max(0, time - seconds + (i * seconds) / (count - 1)),
    ),
  );
}
