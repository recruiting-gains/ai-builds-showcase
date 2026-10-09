import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  normalizeSave,
  gateOpen,
  Session,
  verifyReplay,
  onFloor,
  blocked,
  crossed,
} from "../lib/game.ts";
const interact = (target) => ({ type: "interact", target });
const solution = [
  interact("cyan"),
  { type: "forward" },
  interact("amber"),
  { type: "forward" },
  interact("near"),
  interact("far"),
  { type: "forward" },
  { type: "forward" },
  { type: "goal" },
];
function apply(actions) {
  return actions.reduce((s, a) => {
    const next = transition(s, a);
    assert.ok(next, JSON.stringify(a));
    return next;
  }, initialState());
}
test("three rules require successful crossings; goal pad is the only win", () => {
  let s = transition(initialState(), interact("cyan"));
  assert.deepEqual(s.solved, [false, false, false]);
  s = apply(solution.slice(0, -1));
  assert.equal(s.room, 4);
  assert.equal(s.won, false);
  assert.deepEqual(s.solved, [true, true, true]);
  assert.equal(transition(s, { type: "goal" }).won, true);
});
test("default cyan route loops once without credit", () => {
  const s = new Session();
  s.position = { x: 0, z: -3.13 };
  s.move(0, -1, 0.02);
  assert.equal(s.state.room, 0);
  assert.deepEqual(s.state.solved, [false, false, false]);
  assert.equal(s.history.length, 1);
  assert.equal(s.position.z, 1.6);
  s.move(0, 1, 0.02);
  assert.equal(s.history.length, 1);
});
test("no key and wrong key keep amber door solid; amber opens it", () => {
  let s = apply(solution.slice(0, 2));
  for (const key of ["none", "violet", "amber"]) {
    s = { ...s, key };
    assert.equal(gateOpen(s), key === "amber");
    assert.equal(blocked(s, { x: 0, z: -3.3 }), key !== "amber");
    assert.equal(!!transition(s, { type: "forward" }), key === "amber");
  }
});
test("only reciprocal violet pairing opens the connection, in either action order", () => {
  const base = apply(solution.slice(0, 4));
  for (const near of [1, 3])
    for (const far of [0, 2])
      assert.equal(gateOpen({ ...base, near, far }), near === 3 && far === 2);
  assert.ok(
    gateOpen(
      apply([...solution.slice(0, 4), interact("far"), interact("near")]),
    ),
  );
});
test("console interaction requires proximity and cannot be activated from another room", () => {
  const session = new Session();
  session.position = { x: 3, z: 3 };
  assert.equal(session.act(interact("cyan")), false);
  assert.equal(transition(initialState(), interact("amber")), null);
  session.position = { x: -0.65, z: 0.7 };
  assert.equal(session.act(interact("cyan")), true);
});
test("unsafe saves lose unsupported progress instead of granting it", () => {
  const result = normalizeSave({
    version: 1,
    room: 4,
    cyan: 5,
    key: "gold",
    near: 4,
    far: 7,
    solved: [false, true, true],
    won: true,
  });
  assert.deepEqual(result.state, initialState());
  assert.equal(result.repaired, true);
  assert.equal(
    normalizeSave({
      ...initialState(),
      room: 4,
      solved: [true, true, true],
      won: false,
    }).state.won,
    false,
  );
  assert.equal(normalizeSave({ version: 9 }).state.room, 0);
});
test("all reachable logical states retain a path to the earned goal", () => {
  const actions = [
    ...["cyan", "amber", "violet", "near", "far"].map(interact),
    { type: "forward" },
    { type: "return" },
    { type: "pair-return" },
    { type: "goal" },
  ];
  const key = JSON.stringify;
  const start = initialState(),
    states = new Map([[key(start), start]]),
    queue = [start],
    reverse = new Map();
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i];
    for (const a of actions) {
      const n = transition(s, a);
      if (!n) continue;
      const nk = key(n),
        sk = key(s);
      if (!reverse.has(nk)) reverse.set(nk, []);
      reverse.get(nk).push(sk);
      if (!states.has(nk)) {
        states.set(nk, n);
        queue.push(n);
      }
    }
  }
  const winners = [...states].filter(([, s]) => s.won).map(([k]) => k),
    canWin = new Set(winners);
  for (let i = 0; i < winners.length; i++)
    for (const prev of reverse.get(winners[i]) ?? [])
      if (!canWin.has(prev)) {
        canWin.add(prev);
        winners.push(prev);
      }
  assert.ok(states.size > 20);
  assert.equal(
    canWin.size,
    states.size,
    `${states.size - canWin.size} trapped states`,
  );
});
test("return arches preserve earned rules and do not depend on current keys", () => {
  let s = apply(solution.slice(0, 7));
  for (let room = 3; room > 0; room--) {
    s = transition(
      { ...s, key: "violet", near: 1, far: 0 },
      { type: "return" },
    );
    assert.equal(s.room, room - 1);
    assert.deepEqual(s.solved, [true, true, true]);
  }
});
test("reach follows its actual L-shaped floor and falling recovers", () => {
  assert.equal(onFloor(3, { x: 0, z: 2 }), true);
  assert.equal(onFloor(3, { x: 2.1, z: -2 }), true);
  assert.equal(onFloor(3, { x: 0, z: -2 }), false);
  const session = new Session(apply(solution.slice(0, 7)));
  session.position = { x: 0, z: 0.55 };
  for (let i = 0; i < 20 && session.falls === 0; i++) session.move(0, -1, 0.05);
  assert.ok(session.falls > 0);
  for (let i = 0; i < 20; i++) session.move(0, 0, 0.05);
  assert.deepEqual(session.position, { x: 0, z: 1.6 });
  assert.deepEqual(session.state.solved, [true, true, true]);
});
test("forward and reciprocal reverse traversal are separate, single transitions", () => {
  const s = apply(solution.slice(0, 6));
  assert.deepEqual(crossed(s, { x: 0, z: -3.1 }, { x: 0, z: -3.2 }), {
    type: "forward",
  });
  const session = new Session(s);
  session.position = { x: 0, z: -3.1 };
  session.move(0, -1, 0.05);
  assert.equal(session.state.room, 3);
  for (let i = 0; i < 10; i++) session.move(0, 0, 0.05);
  assert.equal(session.state.room, 3);
  assert.equal(session.history.length, 1);
  assert.equal(transition(session.state, { type: "pair-return" }).room, 2);
});
test("replay checker rejects illegal, malformed and oversized histories", () => {
  assert.deepEqual(verifyReplay(solution), { ok: true, solved: 3, won: true });
  assert.equal(verifyReplay([{ type: "goal" }]).ok, false);
  assert.equal(
    verifyReplay([{ type: "interact", target: "cyan", extra: true }]).ok,
    false,
  );
  assert.equal(verifyReplay(Array(257).fill({ type: "forward" })).ok, false);
});
