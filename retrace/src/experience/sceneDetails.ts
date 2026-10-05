import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The physical router and every field shell share this exact world-space origin.
export const ROUTER_ORIGIN = new T.Vector3(3.22, 1.27, 2.5);
const standard = (color: number, roughness = .8, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
function rounded(w: number, h: number, d: number, r = .03) { return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)); }
function mesh(group: T.Group, geometry: T.BufferGeometry, material: T.Material, p: number[], scale?: number[]) {
  const object = new T.Mesh(geometry, material); object.position.set(p[0], p[1], p[2]);
  if (scale) object.scale.set(scale[0], scale[1], scale[2]);
  object.castShadow = object.receiveShadow = true; group.add(object); return object;
}
function limb(group: T.Group, a: number[], b: number[], top: number, bottom: number, material: T.Material) {
  const av = new T.Vector3(...a), bv = new T.Vector3(...b), direction = bv.clone().sub(av);
  const object = mesh(group, new T.CylinderGeometry(top, bottom, direction.length(), 12), material, av.clone().add(bv).multiplyScalar(.5).toArray());
  object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); return object;
}
function merge(group: T.Group) {
  const buckets = new Map<T.Material, T.BufferGeometry[]>();
  for (const child of [...group.children]) {
    if (!(child instanceof T.Mesh)) continue;
    child.updateMatrix();
    const geo = child.geometry.clone().applyMatrix4(child.matrix);
    const expanded = geo.index ? geo.toNonIndexed() : geo;
    expanded.deleteAttribute("uv");
    const items = buckets.get(child.material) || []; items.push(expanded); buckets.set(child.material, items);
    child.geometry.dispose(); group.remove(child);
  }
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    mesh(group, geometry, material, [0, 0, 0]);
  }
}

export function createRouter() {
  const group = new T.Group(); group.name = "physical-wifi-router";
  // Resting on the entry console; light body, dark underside, vents and antennae.
  group.position.set(ROUTER_ORIGIN.x, 1.044, ROUTER_ORIGIN.z);
  const shell = standard(0xe1e1d4, .42), seam = standard(0x1a2428, .62), metal = standard(0x334148, .4, .3);
  mesh(group, rounded(.68, .105, .31, .04), shell, [0, .067, 0]);
  mesh(group, rounded(.61, .024, .26, .012), seam, [0, .008, 0]);
  for (let i = 0; i < 13; i++) mesh(group, new T.BoxGeometry(.018, .0015, .145), seam, [-.24 + i * .04, .121, -.012]);
  for (const side of [-1, 1]) {
    mesh(group, new T.CylinderGeometry(.019, .026, .05, 12), metal, [side * .25, .11, -.1]);
    const antenna = mesh(group, rounded(.034, .40, .037, .013), shell, [side * .29, .325, -.105]);
    antenna.rotation.z = -side * .13;
  }
  const led = new T.MeshBasicMaterial({ color: 0xa7e0d5 });
  for (let i = 0; i < 3; i++) mesh(group, new T.SphereGeometry(.009, 8, 6), led, [-.07 + i * .04, .063, .157]);
  merge(group);
  group.userData.signalOrigin = ROUTER_ORIGIN.toArray();
  return group;
}

export function createVisitors() {
  const visitors = new T.Group(); visitors.name = "visitors-outside";
  function person(x: number, z: number, feminine: boolean) {
    const group = new T.Group(), skin = standard(0xb9957f, .9), hair = standard(0x292821, .95);
    const coat = standard(feminine ? 0x756c58 : 0x25323a, .96), trousers = standard(feminine ? 0x252b2d : 0x1c2429, .98), shoes = standard(0x161c1d, .8);
    const profile = feminine ? [[.17,.78],[.19,.91],[.145,1.08],[.165,1.27],[.205,1.39],[.145,1.43]] : [[.16,.90],[.195,1.01],[.20,1.25],[.245,1.39],[.16,1.45]];
    const torso = mesh(group, new T.LatheGeometry(profile.map(p => new T.Vector2(...p)), 24), coat, [0, 0, 0]); torso.scale.z = .61;
    // Unequal leg and arm poses make weight and a quiet interaction readable.
    const hip = .89;
    limb(group, [-.09,hip,0], [-.105,.48,.015], .076,.084,trousers);
    limb(group, [-.105,.48,.015], [-.115,.105,-.015], .053,.069,trousers);
    limb(group, [.09,hip,0], [.115,.49,.08], .071,.081,trousers);
    limb(group, [.115,.49,.08], [.15,.105,.16], .052,.068,trousers);
    mesh(group, rounded(.145,.095,.27,.035),shoes,[-.115,.06,-.06]);
    mesh(group, rounded(.14,.095,.26,.035),shoes,[.15,.06,.115]);
    for (const side of [-1,1]) {
      const bent = !feminine && side === 1;
      const elbow = [side * .255,1.10,bent ? -.14 : .03];
      const wrist = [side * (bent ? .19 : .27),bent ? 1.28 : .86,bent ? -.32 : -.005];
      limb(group,[side*.215,1.36,0],elbow,.075,.083,coat);
      limb(group,elbow,wrist,.047,.066,coat);
      mesh(group,new T.SphereGeometry(.055,12,10),skin,[wrist[0],wrist[1]-.024,wrist[2]],[.65,1.2,.78]);
    }
    mesh(group,new T.CylinderGeometry(.053,.06,.12,12),skin,[0,1.47,0]);
    const head = mesh(group,new T.SphereGeometry(1,24,18),skin,[0,1.625,-.007],[.106,.143,.105]); head.rotation.x = .035;
    mesh(group,new T.SphereGeometry(1,24,14,0,Math.PI*2,0,Math.PI*.58),hair,[0,1.66,.008],[.11,.12,.114]);
    if (feminine) mesh(group,new T.SphereGeometry(1,20,14),hair,[0,1.56,.075],[.113,.19,.067]);
    // Facial planes remain restrained at architectural camera distance.
    mesh(group,new T.SphereGeometry(1,12,8),skin,[0,1.618,-.101],[.019,.027,.024]);
    if (!feminine) {
      const phone=mesh(group,rounded(.075,.15,.012,.008),standard(0x10191e,.25,.3),[.19,1.33,-.34]); phone.rotation.x=-.28;
      const collar=mesh(group,new T.CylinderGeometry(.082,.105,.06,18,1,true),coat,[0,1.46,0]);collar.scale.z=.8;
    }
    merge(group); group.position.set(x,.062,z); group.rotation.y=feminine ? -.16 : .13;
    group.scale.setScalar(feminine ? .94 : 1.035); visitors.add(group);
  }
  person(.12,6.3,false); person(.95,6.51,true);
  return visitors;
}

export function createPresence() {
  const group = new T.Group(), material = new T.MeshBasicMaterial({ color: 0xb1e5db, transparent: true, opacity: .68, depthWrite: false });
  mesh(group,new T.SphereGeometry(1,16,12),material,[0,1.56,0],[.11,.14,.11]);
  mesh(group,new T.LatheGeometry([[.14,.79],[.13,1.02],[.20,1.28],[.12,1.40]].map(p=>new T.Vector2(...p)),16),material,[0,0,0],[1,1,.6]);
  for(const side of [-1,1]) {
    limb(group,[side*.08,.83,0],[side*.105,.13,0],.045,.068,material);
    limb(group,[side*.19,1.3,0],[side*.26,.8,0],.034,.056,material);
  }
  merge(group); group.children.forEach(child => { child.castShadow = child.receiveShadow = false; });
  group.position.set(-.55,.32,.85); group.name="illustrative-presence";
  return group;
}

export function createPorchLantern() {
  const group = new T.Group(); group.name = "porch-lantern"; group.position.set(-.12, 2.08, 3.77);
  const frame = standard(0x182227, .46, .4);
  const lens = new T.MeshStandardMaterial({ color: 0xffddad, emissive: 0xffb568, emissiveIntensity: 3, roughness: .7 });
  mesh(group, rounded(.16,.39,.13,.014), frame, [0,0,0]);
  mesh(group, rounded(.102,.285,.013,.008), lens, [0,0,.071]);
  mesh(group, rounded(.008,.285,.076,.003), lens, [.084,0,.016]);
  mesh(group, rounded(.018,.39,.032,.002), frame, [0,0,.084]);
  return group;
}
