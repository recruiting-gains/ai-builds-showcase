/** Shared, deterministic puzzle rules. Coordinates are local to the current room. */
export const SAVE_VERSION = 1;
export const SAVE_KEY = "foldspace:v1:save";
export const ROOM_NAMES = [
  "Arrival",
  "Prism",
  "Relay",
  "Reach",
  "Home",
] as const;
export const ROOM_HINTS = [
  "Rotate the cyan doorway. Find a way to Prism.",
  "Two keys. One door. Carry the matching shape.",
  "A connection needs both ends to agree.",
  "The gap is behind you. Follow the narrow path.",
  "Step into the light. You found a way home.",
];
export type Room = 0 | 1 | 2 | 3 | 4;
export type Key = "none" | "amber" | "violet";
export type State = {
  version: 1;
  room: Room;
  cyan: 0 | 1;
  key: Key;
  near: 1 | 3;
  far: 0 | 2;
  solved: [boolean, boolean, boolean];
  won: boolean;
};
export type Target = "cyan" | "amber" | "violet" | "near" | "far";
export type Action =
  | { type: "interact"; target: Target }
  | { type: "forward" }
  | { type: "return" }
  | { type: "pair-return" }
  | { type: "goal" };
export const initialState = (): State => ({
  version: 1,
  room: 0,
  cyan: 0,
  key: "none",
  near: 1,
  far: 0,
  solved: [false, false, false],
  won: false,
});
export const copyState = (s: State): State => ({ ...s, solved: [...s.solved] });
export function normalizeSave(value: unknown): {
  state: State;
  repaired: boolean;
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as State).version !== 1
  )
    return { state: initialState(), repaired: true };
  const raw = value as Partial<State>;
  const s = initialState();
  s.cyan = raw.cyan === 1 ? 1 : 0;
  s.key = raw.key === "amber" || raw.key === "violet" ? raw.key : "none";
  s.near = raw.near === 3 ? 3 : 1;
  s.far = raw.far === 2 ? 2 : 0;
  s.solved[0] = Array.isArray(raw.solved) && raw.solved[0] === true;
  s.solved[1] = s.solved[0] && raw.solved?.[1] === true;
  s.solved[2] = s.solved[1] && raw.solved?.[2] === true;
  const room = raw.room;
  const allowed =
    room === 0 ||
    (room === 1 && s.solved[0]) ||
    (room === 2 && s.solved[1]) ||
    ((room === 3 || room === 4) && s.solved[2]);
  s.room = allowed
    ? (room as Room)
    : s.solved[2]
      ? 3
      : s.solved[1]
        ? 2
        : s.solved[0]
          ? 1
          : 0;
  s.won = raw.won === true && s.room === 4 && s.solved.every(Boolean);
  return { state: s, repaired: JSON.stringify(s) !== JSON.stringify(value) };
}
export function destination(s: State): Room {
  return s.room === 0
    ? s.cyan
    : s.room === 1
      ? 2
      : s.room === 2
        ? s.near
        : s.room === 3
          ? 4
          : 4;
}
export function gateOpen(s: State): boolean {
  return (
    !s.won &&
    (s.room === 0 ||
      (s.room === 1 && s.key === "amber") ||
      (s.room === 2 && s.near === 3 && s.far === 2) ||
      (s.room === 3 && s.solved.every(Boolean)))
  );
}
export function gateMessage(s: State): string {
  if (s.room === 0)
    return s.cyan === 0
      ? "Arrival → Arrival · a loop"
      : "Arrival → Prism · connected";
  if (s.room === 1)
    return s.key === "amber"
      ? "Amber diamond · door open"
      : "This door needs the amber diamond";
  if (s.room === 2)
    return s.near === 3 && s.far === 2
      ? "Relay ⇄ Reach · connected"
      : "Both ends must point to each other";
  return s.room === 3
    ? "Home is on the other side"
    : "Walk onto the glowing circle";
}
export function transition(state: State, action: Action): State | null {
  if (state.won) return null;
  const s = copyState(state);
  if (action.type === "interact") {
    if (action.target === "cyan" && s.room === 0) s.cyan = s.cyan === 0 ? 1 : 0;
    else if (
      (action.target === "amber" || action.target === "violet") &&
      s.room === 1
    )
      s.key = action.target;
    else if (action.target === "near" && s.room === 2)
      s.near = s.near === 1 ? 3 : 1;
    else if (action.target === "far" && s.room === 2)
      s.far = s.far === 0 ? 2 : 0;
    else return null;
  } else if (action.type === "return") {
    if (s.room === 0) return null;
    s.room = (s.room - 1) as Room;
  } else if (action.type === "pair-return") {
    if (s.room !== 3 || s.near !== 3 || s.far !== 2) return null;
    s.room = 2;
  } else if (action.type === "forward") {
    if (!gateOpen(s)) return null;
    if (s.room === 0) {
      s.room = s.cyan;
      if (s.cyan === 1) s.solved[0] = true;
    } else if (s.room === 1) {
      s.room = 2;
      s.solved[1] = true;
    } else if (s.room === 2) {
      s.room = 3;
      s.solved[2] = true;
    } else if (s.room === 3) s.room = 4;
    else return null;
  } else if (action.type === "goal") {
    if (s.room !== 4 || !s.solved.every(Boolean)) return null;
    s.won = true;
  } else return null;
  return s;
}
export type Point = { x: number; z: number };
export type Interactable = {
  id: Target;
  x: number;
  z: number;
  label: string;
  symbol: string;
};
export function interactables(room: Room): Interactable[] {
  return room === 0
    ? [
        {
          id: "cyan",
          x: -1.3,
          z: 0.15,
          label: "Rotate destination",
          symbol: "↻",
        },
      ]
    : room === 1
      ? [
          {
            id: "amber",
            x: -1.25,
            z: 0.15,
            label: "Take amber diamond",
            symbol: "◇",
          },
          {
            id: "violet",
            x: 1.25,
            z: 0.15,
            label: "Take violet triangle",
            symbol: "△",
          },
        ]
      : room === 2
        ? [
            {
              id: "near",
              x: -1.25,
              z: 0.15,
              label: "Rotate Relay’s destination",
              symbol: "↗",
            },
            {
              id: "far",
              x: 1.25,
              z: 0.15,
              label: "Rotate Reach’s return",
              symbol: "↙",
            },
          ]
        : [];
}
export function nearestTarget(s: State, p: Point): Interactable | null {
  return (
    interactables(s.room)
      .map((i) => ({ i, d: Math.hypot(i.x - p.x, i.z - p.z) }))
      .filter((v) => v.d <= 1.15)
      .sort((a, b) => a.d - b.d || a.i.id.localeCompare(b.i.id))[0]?.i ?? null
  );
}
export function onFloor(room: Room, p: Point): boolean {
  if (room !== 3) return Math.abs(p.x) <= 3.7 && Math.abs(p.z) <= 3.7;
  return (
    (p.x >= -0.8 && p.x <= 0.8 && p.z >= 0.5 && p.z <= 3.15) ||
    (p.x >= -0.8 && p.x <= 3.1 && p.z >= -0.3 && p.z <= 1.5) ||
    (p.x >= 1.25 && p.x <= 3.1 && p.z >= -3.5 && p.z <= 1.5)
  );
}
export const spawnPoint = (): Point => ({ x: 0, z: 1.6 });
export function blocked(s: State, p: Point): boolean {
  // Solid plinths and rear wall; the colored opening is 2.8 units wide.
  if (
    interactables(s.room).some((i) => Math.hypot(i.x - p.x, i.z - p.z) < 0.46)
  )
    return true;
  if (s.room !== 3 && p.z < -3.15 && (Math.abs(p.x) > 1.2 || !gateOpen(s)))
    return true;
  if (
    s.room === 3 &&
    p.z < -2.9 &&
    (Math.abs(p.x - 2.1) > 0.65 || !gateOpen(s))
  )
    return true;
  if (s.room !== 3 && ((p.x < -3.28 && p.z < 0) || p.x > 3.28)) return true;
  return false;
}
export function crossed(s: State, from: Point, to: Point): Action | null {
  if (s.room === 4 && Math.hypot(to.x, to.z + 0.7) < 0.7)
    return { type: "goal" };
  const threshold = s.room === 3 ? -2.9 : -3.15;
  if (
    s.room !== 4 &&
    from.z >= threshold &&
    to.z < threshold &&
    Math.abs(to.x - (s.room === 3 ? 2.1 : 0)) < (s.room === 3 ? 0.65 : 1.2) &&
    gateOpen(s)
  )
    return { type: "forward" };
  if (s.room === 3) {
    if (from.x <= 2.7 && to.x > 2.7 && Math.abs(to.z - 0.65) < 0.55)
      return { type: "return" };
    if (
      from.z <= 2.75 &&
      to.z > 2.75 &&
      Math.abs(to.x) < 0.65 &&
      s.near === 3 &&
      s.far === 2
    )
      return { type: "pair-return" };
  } else if (
    s.room > 0 &&
    from.z <= 2.9 &&
    to.z > 2.9 &&
    Math.abs(to.x + 2.7) < 0.65
  )
    return { type: "return" };
  return null;
}
export type View = {
  state: State;
  position: Point;
  target: Interactable | null;
  notice: string;
  falls: number;
  elapsed: number;
};
export class Session {
  state: State;
  position: Point = spawnPoint();
  facing = 0;
  elapsed = 0;
  falls = 0;
  cooldown = 0;
  falling = 0;
  notice = "";
  history: Action[] = [];
  onChange: () => void = () => {};
  constructor(state: State = initialState()) {
    this.state = copyState(state);
  }
  view(): View {
    return {
      state: copyState(this.state),
      position: { ...this.position },
      target: nearestTarget(this.state, this.position),
      notice: this.notice,
      falls: this.falls,
      elapsed: this.elapsed,
    };
  }
  act(action: Action): boolean {
    if (
      action.type === "interact" &&
      nearestTarget(this.state, this.position)?.id !== action.target
    )
      return false;
    const next = transition(this.state, action);
    if (!next) return false;
    const oldRoom = this.state.room;
    this.state = next;
    this.history.push(action);
    if (
      action.type === "forward" ||
      action.type === "return" ||
      action.type === "pair-return"
    ) {
      this.position = spawnPoint();
      this.facing = 0;
      this.cooldown = 0.45;
      this.notice =
        oldRoom === next.room
          ? "A loop. Same room, different possibility."
          : `${ROOM_NAMES[next.room]}. ${ROOM_HINTS[next.room]}`;
    } else if (action.type === "interact")
      this.notice =
        action.target === "amber"
          ? "Amber diamond in hand. The matching door opens."
          : action.target === "violet"
            ? "Violet triangle in hand. Does the shape match the door?"
            : gateMessage(next);
    else this.notice = "You folded the distance. Welcome home.";
    this.onChange();
    return true;
  }
  interact() {
    const t = nearestTarget(this.state, this.position);
    return t ? this.act({ type: "interact", target: t.id }) : false;
  }
  respawn() {
    this.position = spawnPoint();
    this.falling = 0;
    this.cooldown = 0.45;
    this.onChange();
  }
  move(dx: number, dz: number, dt: number) {
    if (this.state.won) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.falling > 0) {
      this.falling -= dt;
      if (this.falling <= 0) this.respawn();
      return;
    }
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return;
    dx /= Math.max(1, len);
    dz /= Math.max(1, len);
    this.facing = Math.atan2(-dx, -dz);
    const from = { ...this.position };
    let to = { x: from.x + dx * 3.4 * dt, z: from.z + dz * 3.4 * dt };
    if (blocked(this.state, to)) {
      const slideX = { x: to.x, z: from.z },
        slideZ = { x: from.x, z: to.z };
      to = !blocked(this.state, slideX)
        ? slideX
        : !blocked(this.state, slideZ)
          ? slideZ
          : from;
    }
    if (this.cooldown <= 0) {
      const edge = crossed(this.state, from, to);
      if (edge && this.act(edge)) return;
    }
    this.position = to;
    if (!onFloor(this.state.room, to)) {
      this.falls++;
      this.falling = 0.65;
      this.notice = "The void gives second chances.";
      this.onChange();
    }
  }
}
export function validAction(a: unknown): a is Action {
  if (!a || typeof a !== "object" || Array.isArray(a)) return false;
  const v = a as Record<string, unknown>;
  return v.type === "interact"
    ? Object.keys(v).length === 2 &&
        ["cyan", "amber", "violet", "near", "far"].includes(String(v.target))
    : Object.keys(v).length === 1 &&
        ["forward", "return", "pair-return", "goal"].includes(String(v.type));
}
export function verifyReplay(actions: unknown): {
  ok: boolean;
  solved: number;
  won: boolean;
  error?: string;
} {
  if (!Array.isArray(actions) || actions.length > 256)
    return {
      ok: false,
      solved: 0,
      won: false,
      error: "Provide at most 256 puzzle actions.",
    };
  let s = initialState();
  for (let i = 0; i < actions.length; i++) {
    if (!validAction(actions[i]))
      return {
        ok: false,
        solved: 0,
        won: false,
        error: `Invalid action at ${i}.`,
      };
    const next = transition(s, actions[i]);
    if (!next)
      return {
        ok: false,
        solved: s.solved.filter(Boolean).length,
        won: s.won,
        error: `Action ${i} is not allowed in this state.`,
      };
    s = next;
  }
  return { ok: true, solved: s.solved.filter(Boolean).length, won: s.won };
}
