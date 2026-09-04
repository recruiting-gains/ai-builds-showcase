import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { ExperimentRun } from "../shared/contracts";
import { CASES } from "../shared/corpus";

export interface LabScene {
  update(run: ExperimentRun | null, running: boolean): void;
  pause(value: boolean): void;
  reset(): void;
  select(index: number): void;
  dispose(): void;
}
export function createLabScene(
  container: HTMLElement,
  onCase: (index: number) => void,
): LabScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setClearColor(0x09131c, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 70);
  const start = new THREE.Vector3(8.1, 6.9, 10.7);
  camera.position.copy(start);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.4, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.3;
  controls.minAzimuthAngle = -0.65;
  controls.maxAzimuthAngle = 1.05;
  controls.update();
  // The scene encodes case progress; ordinary HTML controls expose all the same information.
  renderer.domElement.setAttribute("tabindex", "-1");
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.AmbientLight(0x9fc3d8, 0.7));
  const key = new THREE.DirectionalLight(0xe5f9ff, 2);
  key.position.set(2, 9, 5);
  scene.add(key);
  const fill = new THREE.PointLight(0x65f3c5, 8, 12);
  fill.position.set(-3, 3, -1);
  scene.add(fill);
  const warm = new THREE.PointLight(0xffaf59, 10, 12);
  warm.position.set(3, 3, -2);
  scene.add(warm);
  const metal = new THREE.MeshStandardMaterial({
    color: 0x203440,
    metalness: 0.82,
    roughness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x101c28,
    metalness: 0.75,
    roughness: 0.4,
  });
  const rim = new THREE.MeshStandardMaterial({
    color: 0x617277,
    metalness: 0.95,
    roughness: 0.3,
  });
  const mint = 0x82ffca,
    amber = 0xffb558;
  const glow = (color: number, intensity = 1.2) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.3,
      roughness: 0.3,
    });
  const mintMat = glow(mint),
    amberMat = glow(amber);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x93dedc,
    metalness: 0.1,
    roughness: 0.12,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const root = new THREE.Group();
  scene.add(root);
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = metal,
    rounded = false,
  ) {
    const mesh = new THREE.Mesh(
      rounded
        ? new RoundedBoxGeometry(w, h, d, 2, 0.06)
        : new THREE.BoxGeometry(w, h, d),
      material,
    );
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  }
  function tube(
    radius: number,
    thickness: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    arc = Math.PI * 2,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, thickness, 8, 64, arc),
      material,
    );
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  }
  box(8.8, 0.28, 6.8, 0, -0.25, 0, dark, true);
  box(8.5, 0.11, 6.5, 0, -0.04, 0, metal, true);
  for (let i = 0; i < 9; i++) {
    box(0.012, 0.008, 6.1, -4 + i, 0.022, 0, rim);
  }
  for (let i = 0; i < 7; i++) {
    box(8.1, 0.008, 0.012, 0, 0.022, -3 + i, rim);
  }
  for (const x of [-4.15, 4.15]) {
    box(0.12, 0.13, 6.45, x, 0.03, 0, dark);
    box(0.032, 0.025, 5.8, x, 0.11, 0, x < 0 ? mintMat : amberMat);
  }
  box(8.2, 0.18, 0.12, 0, 0.04, 3.2, dark);
  box(6.8, 0.027, 0.02, 0, 0.14, 3.28, mintMat);
  // Rear equipment wall and circular two-color experiment loop.
  box(8, 0.9, 0.18, 0, 0.45, -3, metal, true);
  for (let i = 0; i < 8; i++) {
    box(0.83, 0.68, 0.08, -3.55 + i, 0.48, -2.87, dark, true);
    box(0.32, 0.025, 0.015, -3.55 + i, 0.7, -2.82, i < 4 ? mintMat : amberMat);
  }
  box(0.65, 1.3, 0.6, 0, 0.62, -2.62, dark, true);
  tube(1.23, 0.17, 0, 2.05, -2.68, metal);
  tube(1.02, 0.05, 0, 2.05, -2.57, rim);
  const loopA = tube(1.22, 0.048, 0, 2.05, -2.48, mintMat, Math.PI * 0.91);
  const loopB = tube(1.22, 0.048, 0, 2.05, -2.48, amberMat, Math.PI * 0.91);
  loopB.rotation.z = Math.PI;
  const inner = tube(0.87, 0.026, 0, 2.05, -2.51, mintMat, Math.PI * 1.65);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const m = box(
      0.13,
      0.23,
      0.15,
      Math.cos(a) * 1.24,
      2.05 + Math.sin(a) * 1.24,
      -2.66,
      dark,
    );
    m.rotation.z = a - Math.PI / 2;
  }
  const capsules: THREE.Mesh[] = [];
  const resultNodes: THREE.Mesh[] = [];
  const rings: THREE.Mesh[] = [];
  for (const [lane, x, color] of [
    [0, -1.65, mint],
    [1, 1.65, amber],
  ] as const) {
    const colorMat = lane === 0 ? mintMat : amberMat;
    box(1.25, 0.28, 5.08, x, 0.16, 0.08, dark, true);
    box(1.1, 0.06, 4.9, x, 0.34, 0.08, metal);
    for (const side of [-1, 1]) {
      box(0.04, 0.04, 4.5, x + side * 0.55, 0.43, 0.08, colorMat);
    }
    for (let z = -1.8; z < 2.3; z += 0.22)
      box(0.97, 0.045, 0.07, x, 0.395, z, rim);
    for (const z of [-1.35, 0.15, 1.65]) {
      tube(0.48, 0.07, x, 0.99, z, metal);
      const r = tube(0.44, 0.025, x, 0.99, z + 0.055, colorMat, Math.PI * 1.7);
      rings.push(r);
      box(0.1, 0.52, 0.16, x - 0.46, 0.6, z, metal);
      box(0.1, 0.52, 0.16, x + 0.46, 0.6, z, metal);
    }
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.37, 0.37, 3.7, 24, 1, true),
      glass,
    );
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(x, 0.99, 0.1);
    root.add(cylinder);
    for (let i = 0; i < 10; i++) {
      const material = glow(0x34484e, 0.18);
      const capsule = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.125, 1),
        material,
      );
      capsule.position.set(x, 0.99, 2.07 - i * 0.425);
      root.add(capsule);
      capsules.push(capsule);
      const nodeX = lane === 0 ? -3.25 : 3.25;
      const nodeZ = 2.4 - i * 0.49;
      box(0.48, 0.12, 0.34, nodeX, 0.15, nodeZ, dark, true);
      const node = new THREE.Mesh(
        new THREE.BoxGeometry(0.31, 0.035, 0.22),
        glow(0x3b505b, 0.13),
      );
      node.position.set(nodeX, 0.23, nodeZ);
      node.userData.caseIndex = i;
      root.add(node);
      resultNodes.push(node);
    }
    const terminal = box(1.28, 0.22, 0.7, x, 0.3, 2.75, metal, true);
    terminal.rotation.x = 0.15;
    const display = box(0.84, 0.025, 0.37, x, 0.443, 2.73, colorMat);
    display.rotation.x = 0.15;
    box(0.64, 0.035, 0.04, x, 0.456, 2.91, dark);
    // Control towers retain a clear miniature scale.
    box(0.7, 0.25, 0.8, x * 2.1, 0.16, -2.14, metal, true);
    for (const dx of [-0.2, 0.2]) {
      const g = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.76, 14),
        glass,
      );
      g.position.set(x * 2.1 + dx, 0.68, -2.14);
      root.add(g);
      const cap = tube(0.16, 0.035, x * 2.1 + dx, 1.08, -2.14, colorMat);
      cap.rotation.x = Math.PI / 2;
      const stem = box(0.04, 0.58, 0.04, x * 2.1 + dx, 0.69, -2.14, colorMat);
      stem.userData.color = color;
    }
  }
  for (const x of [-3.95, -2.7, 2.7, 3.95]) {
    box(0.09, 0.15, 0.09, x, 0.2, 3, dark);
    box(0.05, 0.07, 0.05, x, 0.31, 3, amberMat);
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(800, 450),
    0.18,
    0.2,
    2.3,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let downX = 0,
    downY = 0;
  const down = (event: PointerEvent) => {
    downX = event.clientX;
    downY = event.clientY;
  };
  const up = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
    const rect = container.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(resultNodes)[0];
    if (hit) onCase(Number(hit.object.userData.caseIndex));
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches,
    running = false,
    disposed = false,
    visible = true,
    frame = 0,
    time = 0,
    last = 0;
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  function draw() {
    controls.update();
    composer.render();
  }
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (document.hidden || !visible) return;
    if (now - last < 33) return;
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (paused) {
      if (controls.update()) composer.render();
      return;
    }
    time += delta;
    inner.rotation.z = time * 0.12;
    rings.forEach(
      (ring, i) => (ring.rotation.z = time * (i % 2 ? 0.22 : -0.2)),
    );
    capsules.forEach((mesh, i) => {
      mesh.rotation.y = time * 0.6 + i;
      mesh.rotation.z = time * 0.3;
      mesh.position.y =
        0.99 +
        (running
          ? Math.sin(time * 4 + i) * 0.035
          : Math.sin(time * 0.7 + i) * 0.013);
    });
    draw();
  }
  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  });
  visibilityObserver.observe(container);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  frame = requestAnimationFrame(animate);
  container.parentElement?.classList.add("webgl");
  return {
    update(run, isRunning) {
      running = isRunning;
      for (let i = 0; i < 20; i++) {
        const lane = i < 10 ? "A" : "B";
        const result = run?.results.find(
          (r) => r.lane === lane && r.caseId === CASES[i % 10].id,
        );
        const color = result
          ? result.error
            ? amber
            : result.grade.passed
              ? mint
              : 0xff6979
          : 0x3b515e;
        for (const mesh of [capsules[i], resultNodes[i]]) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.color.setHex(color);
          m.emissive.setHex(color);
          m.emissiveIntensity = result ? 1.6 : 0.18;
        }
      }
      draw();
    },
    pause(value) {
      paused = value;
      draw();
    },
    reset() {
      camera.position.copy(start);
      controls.target.set(0, 0.4, 0);
      controls.update();
      draw();
    },
    select(index) {
      resultNodes.forEach((n, i) =>
        n.scale.setScalar(i % 10 === index ? 1.35 : 1),
      );
      draw();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibilityObserver.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      environment.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
