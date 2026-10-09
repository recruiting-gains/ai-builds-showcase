import * as THREE from "three";
import {
  Session,
  initialState,
  destination,
  gateOpen,
  interactables,
  ROOM_NAMES,
  type State,
  type View,
  type Target,
} from "./game";
export const ROOM_CENTERS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(-11, 5, -8),
  new THREE.Vector3(10, 9, -14),
  new THREE.Vector3(-3, 15, -24),
  new THREE.Vector3(13, 21, -33),
];
const COLORS = [0x69f3dc, 0xffc27c, 0xb598ff, 0xe7ebff, 0xffe3a7];
export type WorldOptions = {
  state: State;
  onUpdate: (view: View) => void;
  onChange: (state: State) => void;
  onError: (message: string) => void;
  demo?: boolean;
  manual?: boolean;
  reducedMotion?: boolean;
};
export type WorldHandle = {
  start: () => void;
  pause: (value: boolean) => void;
  interact: () => void;
  direction: (key: string, down: boolean) => void;
  resetPosition: () => void;
  reset: () => void;
  setSound: (on: boolean) => void;
  dispose: () => void;
  session: Session;
  advance: (dt: number) => void;
  demoDone: () => boolean;
};
type DemoStep =
  | { wait: number }
  | { x: number; z: number; room: number }
  | { action: Target };
const DEMO: DemoStep[] = [
  { wait: 1.4 },
  { x: -0.65, z: 0.7, room: 0 },
  { action: "cyan" },
  { wait: 1.2 },
  { x: 0, z: -3.5, room: 0 },
  { wait: 0.8 },
  { x: -0.65, z: 0.7, room: 1 },
  { action: "amber" },
  { wait: 1.1 },
  { x: 0, z: -3.5, room: 1 },
  { wait: 0.8 },
  { x: -0.65, z: 0.7, room: 2 },
  { action: "near" },
  { wait: 0.8 },
  { x: 0.65, z: 0.7, room: 2 },
  { action: "far" },
  { wait: 1.4 },
  { x: 0, z: -3.5, room: 2 },
  { wait: 0.7 },
  { x: 0, z: 0.8, room: 3 },
  { x: 2.1, z: 0.8, room: 3 },
  { x: 2.1, z: -3.2, room: 3 },
  { wait: 0.7 },
  { x: 0, z: -0.7, room: 4 },
  { wait: 5 },
];
export function createWorld(
  host: HTMLElement,
  options: WorldOptions,
): WorldHandle {
  const session = new Session(options.state);
  let started = Boolean(options.demo),
    paused = false,
    disposed = false,
    frame = 0,
    last = 0,
    time = 0,
    uiTime = 0,
    demoIndex = 0,
    demoWait = 0,
    contextLost = false;
  const keys = new Set<string>();
  let audio: AudioContext | undefined;
  let sound = false;
  function tone(kind: "fold" | "key" | "win") {
    if (!sound || !audio) return;
    const notes =
      kind === "win"
        ? [261.63, 329.63, 392, 523.25]
        : kind === "fold"
          ? [174.61, 261.63, 349.23]
          : [392, 523.25];
    notes.forEach((f, i) => {
      const osc = audio!.createOscillator(),
        gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, audio!.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(
        0.065,
        audio!.currentTime + i * 0.12 + 0.04,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio!.currentTime + i * 0.12 + 0.75,
      );
      osc.connect(gain);
      gain.connect(audio!.destination);
      osc.start(audio!.currentTime + i * 0.12);
      osc.stop(audio!.currentTime + i * 0.12 + 0.8);
    });
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1121");
  scene.fog = new THREE.FogExp2("#0b1121", 0.013);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 180);
  const portalCamera = new THREE.PerspectiveCamera();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: Boolean(options.manual),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Foldspace 3D play area");
  renderer.domElement.setAttribute("role", "img");
  scene.add(new THREE.HemisphereLight(0xadceff, 0x262235, 2.25));
  const sun = new THREE.DirectionalLight(0xffe5c6, 4.5);
  sun.position.set(-12, 30, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -35,
    right: 35,
    top: 50,
    bottom: -25,
    far: 120,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6675dd, 2);
  fill.position.set(15, 10, -30);
  scene.add(fill);
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const makeMat = (v: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(v);
    materials.push(m);
    return m;
  };
  const stone = makeMat({ color: 0xbfc5cf, roughness: 0.85 }),
    sideStone = makeMat({ color: 0x7b889d, roughness: 0.9 }),
    dark = makeMat({ color: 0x303b50, roughness: 0.8 }),
    metal = makeMat({ color: 0x687b92, metalness: 0.5, roughness: 0.4 });
  const floorMat = makeMat({ color: 0xc4c9d0, roughness: 0.8 });
  const glows = COLORS.map((color) =>
    makeMat({ color, emissive: color, emissiveIntensity: 2 }),
  );
  const whiteGlow = makeMat({
    color: 0xcdd7e8,
    emissive: 0xcdd7e8,
    emissiveIntensity: 0.5,
  });
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    parent: THREE.Object3D,
  ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function label(text: string, color: string, width = 2.8) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 768, 128);
    ctx.fillStyle = color;
    ctx.font = "500 54px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 384, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(mat);
    return new THREE.Mesh(new THREE.PlaneGeometry(width, width / 6), mat);
  }
  const floorGroups: THREE.Group[] = [];
  const doorSurfaces: THREE.Mesh[] = [];
  const doorFrames: THREE.Group[] = [];
  const items = new Map<string, THREE.Group>();
  const roomLabels: THREE.Mesh[] = [];
  const renderTarget = new THREE.WebGLRenderTarget(768, 768, {
    type: THREE.HalfFloatType,
  });
  const portalMaterial = new THREE.ShaderMaterial({
    uniforms: {
      portalTexture: { value: renderTarget.texture },
      tint: { value: new THREE.Color(COLORS[0]) },
      openness: { value: 1 },
      time: { value: 0 },
    },
    vertexShader:
      "varying vec4 screenPosition; varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);screenPosition=gl_Position;}",
    fragmentShader:
      "uniform sampler2D portalTexture;uniform vec3 tint;uniform float openness;uniform float time;varying vec4 screenPosition;varying vec2 vUv;void main(){vec2 uv=screenPosition.xy/screenPosition.w*.5+.5;vec3 view=texture2D(portalTexture,uv).rgb;float edge=pow(abs(vUv.x-.5)*2.,9.)+pow(abs(vUv.y-.5)*2.,12.);float stripe=step(.94,fract(vUv.y*12.-time*.12));vec3 closed=tint*.09+tint*stripe*.13;gl_FragColor=vec4(mix(closed,view*.85+tint*.06,openness)+tint*edge*.45,1.);}",
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  materials.push(portalMaterial);
  function makeFrame(
    parent: THREE.Object3D,
    x: number,
    z: number,
    color: number,
    width = 3.1,
    height = 3.5,
    angle = 0,
    solid = false,
  ) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    parent.add(group);
    const m = solid ? whiteGlow : glows[color];
    box(0.22, height, 0.32, -width / 2, height / 2, 0, dark, group);
    box(0.22, height, 0.32, width / 2, height / 2, 0, dark, group);
    box(width + 0.25, 0.22, 0.32, 0, height, 0, dark, group);
    box(
      0.065,
      height - 0.15,
      0.07,
      -width / 2 + 0.12,
      height / 2,
      0.2,
      m,
      group,
    );
    box(
      0.065,
      height - 0.15,
      0.07,
      width / 2 - 0.12,
      height / 2,
      0.2,
      m,
      group,
    );
    box(width - 0.15, 0.065, 0.07, 0, height - 0.1, 0.2, m, group);
    box(width, 0.03, 0.6, 0, 0.015, 0, m, group);
    return group;
  }
  ROOM_CENTERS.forEach((center, i) => {
    const room = new THREE.Group();
    room.position.copy(center);
    scene.add(room);
    floorGroups.push(room);
    const floor = (w: number, d: number, x: number, z: number) => {
      box(w, 0.48, d, x, -0.25, z, floorMat, room);
      box(w - 0.2, 0.8, d - 0.2, x, -0.88, z, sideStone, room);
      box(w - 0.45, 0.14, d - 0.45, x, -1.4, z, metal, room);
    };
    if (i === 3) {
      floor(1.8, 2.65, 0, 1.85);
      floor(4, 1.8, 1.15, 0.65);
      floor(2, 4.8, 2.2, -0.95);
    } else {
      floor(7.8, 7.8, 0, 0);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.7, 0.5, 3.5, 4),
        dark,
      );
      base.position.y = -3.25;
      base.rotation.y = Math.PI / 4;
      room.add(base);
    }
    if (i !== 3) {
      for (let j = -3; j <= 3; j++) {
        box(0.012, 0.005, 7.6, j, 0.005, 0, metal, room);
        box(7.6, 0.005, 0.012, 0, 0.005, j, metal, room);
      }
      // These walls match the collision extents in game.ts.
      box(2.35, 4.25, 0.42, -2.73, 1.95, -3.65, stone, room);
      box(2.35, 4.25, 0.42, 2.73, 1.95, -3.65, stone, room);
      box(7.8, 0.5, 0.5, 0, 4.25, -3.65, stone, room);
      box(0.45, 2.35, 3.7, -3.7, 1.05, -1.9, stone, room);
      box(0.38, 0.48, 7.8, 3.7, 0.15, 0, stone, room);
      for (let j = 0; j < 3; j++)
        box(0.7, 0.12, 0.7, -2.8, 0.07, -0.75 - j * 0.8, sideStone, room);
    }
    if (i < 4) {
      const frame = makeFrame(
        room,
        i === 3 ? 2.1 : 0,
        i === 3 ? -3.12 : -3.5,
        i,
        i === 3 ? 1.5 : 3.1,
        i === 3 ? 2.8 : 3.5,
      );
      doorFrames.push(frame);
      const surf = new THREE.Mesh(
        new THREE.PlaneGeometry(i === 3 ? 1.26 : 2.78, i === 3 ? 2.55 : 3.22),
        portalMaterial,
      );
      surf.position.set(0, i === 3 ? 1.35 : 1.73, 0.02);
      frame.add(surf);
      doorSurfaces.push(surf);
      const caption = label(
        i === 0
          ? "↻  CHOOSE"
          : i === 1
            ? "◇  CARRY"
            : i === 2
              ? "⇄  CONNECT"
              : "HOME",
        "#e7eff7",
        i === 3 ? 1.4 : 2.7,
      );
      caption.position.set(0, i === 3 ? 3.12 : 3.92, 0.05);
      frame.add(caption);
      const light = new THREE.PointLight(COLORS[i], 10, 8, 2);
      light.position.set(i === 3 ? 2.1 : 0, 2, i === 3 ? -2.5 : -2.8);
      room.add(light);
    }
    const name = label(
      `${String(i + 1).padStart(2, "0")} / ${ROOM_NAMES[i].toUpperCase()}`,
      "#344455",
      3.7,
    );
    name.rotation.x = -Math.PI / 2;
    name.position.set(i === 3 ? 2.1 : 0, 0.02, i === 3 ? -0.7 : 2.45);
    room.add(name);
    roomLabels.push(name);
    if (i > 0) {
      const ret = makeFrame(
        room,
        i === 3 ? 2.88 : -2.7,
        i === 3 ? 0.65 : 3.08,
        0,
        1.45,
        1.8,
        i === 3 ? -Math.PI / 2 : Math.PI,
        true,
      );
      const sign = label("RETURN", "#e6ebf2", 1.2);
      sign.position.set(0, 2.12, 0.08);
      ret.add(sign);
    }
    if (i === 3) {
      makeFrame(room, 0, 3, 2, 1.5, 2.7, Math.PI);
    }
    for (const item of interactables(i as 0 | 1 | 2 | 3 | 4)) {
      const plinth = new THREE.Group();
      plinth.position.set(item.x, 0, item.z);
      room.add(plinth);
      items.set(item.id, plinth);
      box(0.56, 0.55, 0.56, 0, 0.28, 0, dark, plinth);
      box(0.68, 0.07, 0.68, 0, 0.59, 0, metal, plinth);
      const glow =
        item.id === "amber"
          ? glows[1]
          : item.id === "violet"
            ? glows[2]
            : glows[i];
      const obj = new THREE.Mesh(
        item.id === "amber"
          ? new THREE.OctahedronGeometry(0.23)
          : item.id === "violet"
            ? new THREE.TetrahedronGeometry(0.25)
            : new THREE.TorusGeometry(0.23, 0.055, 8, 24),
        glow,
      );
      obj.name = "glyph";
      obj.position.y = 1.05;
      plinth.add(obj);
      const tag = label(
        item.id === "cyan"
          ? "ROTATE"
          : item.id === "near"
            ? "RELAY →"
            : item.id === "far"
              ? "REACH →"
              : item.id.toUpperCase(),
        item.id === "amber"
          ? "#ffcf92"
          : item.id === "violet"
            ? "#d4c4ff"
            : "#c0f1ed",
        1.1,
      );
      tag.position.set(0, 0.15, 0.65);
      tag.rotation.x = -Math.PI / 2;
      plinth.add(tag);
    }
    if (i === 4) {
      const disk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.04, 64),
        makeMat({ color: 0x514833, metalness: 0.6, roughness: 0.4 }),
      );
      disk.position.set(0, 0.03, -0.7);
      room.add(disk);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.045, 10, 64),
        glows[4],
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.07, -0.7);
      room.add(ring);
      const glow = new THREE.PointLight(0xffdfa0, 15, 6);
      glow.position.set(0, 1, -0.7);
      room.add(glow);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.7, 5, 32, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffe4ac,
          transparent: true,
          opacity: 0.075,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.set(0, 2.5, -0.7);
      room.add(beam);
    }
  });
  const avatar = new THREE.Group();
  scene.add(avatar);
  const coat = makeMat({ color: 0xf19651, roughness: 0.75 });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.3, 4, 10),
    coat,
  );
  body.position.y = 0.52;
  body.castShadow = true;
  avatar.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    makeMat({ color: 0xf4efdf }),
  );
  head.position.y = 0.94;
  head.castShadow = true;
  avatar.add(head);
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.178, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    coat,
  );
  hood.position.y = 0.96;
  avatar.add(hood);
  const legs = [
    box(0.1, 0.3, 0.13, -0.1, 0.17, 0, dark, avatar),
    box(0.1, 0.3, 0.13, 0.1, 0.17, 0, dark, avatar),
  ];
  const scarf = box(0.12, 0.38, 0.03, 0, 0.64, 0.24, glows[0], avatar);
  scarf.rotation.x = 0.22;
  const carried = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), glows[1]);
  carried.position.set(0.29, 0.56, -0.08);
  avatar.add(carried);
  const starData = new Float32Array(350 * 3);
  for (let i = 0; i < 350; i++) {
    starData[i * 3] = Math.sin(i * 153.71) * 85;
    starData[i * 3 + 1] = Math.cos(i * 38.17) * 45 + 12;
    starData[i * 3 + 2] = Math.sin(i * 67.87) * 70 - 20;
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute("position", new THREE.BufferAttribute(starData, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x91b8d8,
    size: 0.04,
    transparent: true,
    opacity: 0.65,
  });
  scene.add(new THREE.Points(stars, starMat));
  materials.push(starMat);
  const focus = new THREE.Vector3(0, 1, 0);
  const desiredFocus = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  let width = 1,
    height = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    width = Math.max(r.width, 1);
    height = Math.max(r.height, 1);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderTarget.setSize(
      Math.min(Math.round(width), 1024),
      Math.min(Math.round(height), 1536),
    );
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function updateState() {
    options.onChange(session.state);
    options.onUpdate(session.view());
    const lastAction = session.history.at(-1);
    tone(
      session.state.won
        ? "win"
        : lastAction?.type === "interact"
          ? "key"
          : "fold",
    );
    if (session.falling > 0 || lastAction?.type !== "interact") keys.clear();
  }
  session.onChange = updateState;
  const clear = () => {
    keys.clear();
  };
  const visibility = () => {
    clear();
    if (document.hidden) last = 0;
  };
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", visibility);
  const lost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    clear();
    options.onError(
      "The 3D display was interrupted. Reload to return to your saved room.",
    );
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  function advanceDemo(dt: number): [number, number] {
    const step = DEMO[demoIndex];
    if (!step) return [0, 0];
    if (session.state.won && "x" in step) {
      demoIndex++;
      return [0, 0];
    }
    if ("wait" in step) {
      demoWait += dt;
      if (demoWait >= step.wait) {
        demoIndex++;
        demoWait = 0;
      }
      return [0, 0];
    }
    if ("action" in step) {
      if (session.act({ type: "interact", target: step.action })) demoIndex++;
      return [0, 0];
    }
    if (session.state.room !== step.room) {
      demoIndex++;
      return [0, 0];
    }
    const dx = step.x - session.position.x,
      dz = step.z - session.position.z;
    if (Math.hypot(dx, dz) < 0.08) {
      demoIndex++;
      return [0, 0];
    }
    const n = Math.hypot(dx, dz);
    return [dx / n, dz / n];
  }
  function render(dt: number) {
    const s = session.state;
    const center = ROOM_CENTERS[s.room];
    const mobile = width / height < 0.85;
    desiredFocus.copy(started ? center : new THREE.Vector3(0, 3.5, -5));
    desiredFocus.y += started ? 0.7 : 0;
    if (started) {
      desiredFocus.x += session.position.x * 0.16;
      desiredFocus.z += session.position.z * 0.12;
    }
    if (options.reducedMotion || (options.manual && time < 0.02))
      focus.copy(desiredFocus);
    else focus.lerp(desiredFocus, 1 - Math.exp(-dt * 3.8));
    const scale = mobile ? 1.05 : 1;
    desiredCamera
      .copy(focus)
      .add(
        new THREE.Vector3(
          started ? 10 * scale : 18,
          started ? 12.5 * scale : 18,
          started ? 14 * scale : 24,
        ),
      );
    camera.position.copy(desiredCamera);
    camera.lookAt(focus);
    if (mobile)
      camera.setViewOffset(
        width,
        height,
        0,
        started ? -height * 0.04 : height * 0.05,
        width,
        height,
      );
    else camera.clearViewOffset();
    camera.updateMatrixWorld();
    avatar.visible = started;
    avatar.position.set(
      center.x + session.position.x,
      center.y - (session.falling > 0 ? (1 - session.falling / 0.65) * 4 : 0),
      center.z + session.position.z,
    );
    avatar.rotation.y = session.facing;
    const moving = keys.size > 0 || Boolean(options.demo && !s.won);
    legs[0].rotation.x = moving ? Math.sin(time * 12) * 0.35 : 0;
    legs[1].rotation.x = -legs[0].rotation.x;
    scarf.rotation.x = 0.2 + Math.sin(time * 7) * 0.09;
    carried.visible = s.key !== "none";
    carried.material = s.key === "amber" ? glows[1] : glows[2];
    carried.rotation.y = time;
    items.forEach((item, id) => {
      const glyph = item.getObjectByName("glyph");
      if (glyph) {
        glyph.rotation.y = options.reducedMotion ? 0 : time * 0.6;
        glyph.position.y =
          1.05 + (options.reducedMotion ? 0 : Math.sin(time * 2) * 0.055);
      }
      const near = session.view().target?.id === id;
      item.scale.setScalar(near ? 1.08 : 1);
    });
    doorSurfaces.forEach((surf, i) => {
      surf.visible = i === s.room;
    });
    if (s.room < 4) {
      // A translated virtual camera looks through the entrance into the actual destination scene.
      // Portals are hidden during this pass: a deliberate single-level view, never recursive.
      const dest = ROOM_CENTERS[destination(s)];
      const srcX = s.room === 3 ? 2.1 : 0,
        srcZ = s.room === 3 ? -3.12 : -3.5;
      portalCamera.copy(camera);
      portalCamera.position.add(
        new THREE.Vector3(
          dest.x - center.x - srcX,
          dest.y - center.y,
          dest.z - center.z + 3.45 - srcZ,
        ),
      );
      portalCamera.updateMatrixWorld();
      doorSurfaces.forEach((p) => {
        p.visible = false;
      });
      avatar.visible = false;
      const oldShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(0, 0, -1), dest.z + 3.48),
      ];
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, portalCamera);
      renderer.setRenderTarget(null);
      renderer.clippingPlanes = [];
      renderer.shadowMap.autoUpdate = oldShadow;
      avatar.visible = started;
      doorSurfaces[s.room].visible = true;
      portalMaterial.uniforms.tint.value.set(COLORS[s.room]);
      portalMaterial.uniforms.openness.value = gateOpen(s) ? 1 : 0;
      portalMaterial.uniforms.time.value = time;
    }
    renderer.render(scene, camera);
  }
  function advance(dt: number) {
    if (disposed || contextLost) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    time += dt;
    if (started && !paused && !document.hidden) {
      let dx = 0,
        dz = 0;
      if (options.demo) {
        [dx, dz] = advanceDemo(dt);
      } else {
        const sx = Number(keys.has("right")) - Number(keys.has("left")),
          sy = Number(keys.has("up")) - Number(keys.has("down"));
        dx = sx * 0.814 - sy * 0.581;
        dz = -sx * 0.581 - sy * 0.814;
      }
      session.move(dx, dz, dt);
    }
    render(dt);
    uiTime += dt;
    if (uiTime > 0.08) {
      uiTime = 0;
      options.onUpdate(session.view());
    }
  }
  function animate(t: number) {
    frame = requestAnimationFrame(animate);
    if (!last) last = t;
    const dt = Math.min((t - last) / 1000, 0.05);
    last = t;
    advance(dt);
  }
  focus.copy(
    started ? ROOM_CENTERS[session.state.room] : new THREE.Vector3(0, 3.5, -5),
  );
  render(0.016);
  options.onUpdate(session.view());
  if (!options.manual) frame = requestAnimationFrame(animate);
  return {
    session,
    start() {
      started = true;
      paused = false;
      clear();
    },
    pause(value) {
      paused = value;
      clear();
    },
    interact() {
      if (started && !paused && !options.demo) session.interact();
    },
    direction(key, down) {
      if (down && started && !paused && !options.demo) keys.add(key);
      else keys.delete(key);
    },
    resetPosition() {
      clear();
      session.respawn();
    },
    reset() {
      session.state = initialState();
      session.history = [];
      session.elapsed = 0;
      session.falls = 0;
      session.respawn();
      started = true;
      paused = false;
      demoIndex = 0;
      demoWait = 0;
    },
    setSound(on) {
      sound = on;
      if (on) {
        audio ??= new AudioContext();
        void audio.resume();
        tone("key");
      }
    },
    advance,
    demoDone: () => demoIndex >= DEMO.length,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points)
          o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderTarget.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      void audio?.close();
    },
  };
}
