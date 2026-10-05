import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ScenarioSample } from "../shared/scenarios";
export default function Room({
  sample,
  resetKey,
  reduced,
  forceFallback = false,
}: {
  sample: ScenarioSample;
  resetKey: number;
  reduced: boolean;
  forceFallback?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(sample);
  latest.current = sample;
  const [failed, setFailed] = useState(forceFallback);
  useEffect(() => {
    if (failed || !host.current) return;
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Illustrative 3D room. Drag to rotate; use Reset view to restore.",
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(9.4, 10.2, 11.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.1, 0);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.2;
    controls.update();
    scene.add(new THREE.AmbientLight(0xb0c7c1, 2.2));
    const light = new THREE.DirectionalLight(0xfff5d9, 4);
    light.position.set(-2, 10, 6);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -7;
    light.shadow.camera.right = 7;
    light.shadow.camera.top = 7;
    light.shadow.camera.bottom = -7;
    light.shadow.bias = -0.0005;
    scene.add(light);
    const mat = (color: string, metalness = 0, roughness = 0.8) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness });
    const dark = mat("#344540"),
      floor = mat("#263b35"),
      stone = mat("#64766b"),
      wood = mat("#807866");
    function box(
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      m: THREE.Material,
    ) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    box(8, 0.16, 6, 0, -0.13, 0, floor);
    box(8, 0.1, 0.06, 0, 0.01, 3, stone);
    box(0.06, 0.1, 6, 4, 0.01, 0, stone);
    box(8, 1.4, 0.11, 0, 0.63, -3, dark);
    box(0.11, 1.4, 6, -4, 0.63, 0, dark);
    const grid = new THREE.GridHelper(8, 16, 0x547e70, 0x38534a);
    grid.position.y = -0.038;
    grid.scale.z = 0.75;
    scene.add(grid);
    // Low modular sofa, table, cabinet and plant: original procedural geometry.
    box(2.8, 0.34, 0.98, 0.25, 0.18, -2.08, stone);
    box(2.8, 0.65, 0.22, 0.25, 0.64, -2.59, stone);
    box(0.2, 0.6, 1.05, -1.2, 0.47, -2.08, stone);
    box(0.2, 0.6, 1.05, 1.7, 0.47, -2.08, stone);
    for (let i = 0; i < 3; i++)
      box(0.78, 0.13, 0.72, -0.57 + i * 0.82, 0.4, -2.03, mat("#738577"));
    box(1.45, 0.1, 0.8, 0.3, 0.48, -0.5, wood);
    for (const x of [-0.25, 0.85])
      for (const z of [-0.78, -0.23]) box(0.065, 0.46, 0.065, x, 0.22, z, dark);
    box(0.7, 0.7, 1.5, -3.45, 0.33, -1.7, wood);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.18, 0.4, 20),
      mat("#817c6c"),
    );
    pot.position.set(3.1, 0.2, -2.1);
    scene.add(pot);
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        mat(i % 2 ? "#749079" : "#466c57"),
      );
      leaf.scale.set(0.5, 3, 1);
      leaf.position.set(
        3.1 + Math.cos(i * 2.4) * 0.15,
        0.5 + (i % 3) * 0.13,
        -2.1 + Math.sin(i * 2.4) * 0.15,
      );
      leaf.rotation.z = Math.sin(i) * 0.6;
      scene.add(leaf);
    }
    const nodes = [
      [-3.2, 2.25],
      [3.15, -2.2],
      [3.2, 2.3],
    ];
    for (const [x, z] of nodes) {
      box(0.24, 0.12, 0.24, x, 0.12, z, mat("#c1ece0", 0.2, 0.35));
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 8),
        new THREE.MeshBasicMaterial({ color: "#b5fff0" }),
      );
      led.position.set(x, 0.25, z);
      scene.add(led);
    }
    const lines: THREE.LineLoop[] = [];
    for (let k = 0; k < 6; k++) {
      const points = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      });
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: 0x85dbc8,
          transparent: true,
          opacity: 0.18,
        }),
      );
      ring.position.set(-3.2, 0.035, 2.25);
      scene.add(ring);
      lines.push(ring);
    }
    const marker = new THREE.Group();
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 24, 16),
      new THREE.MeshBasicMaterial({ color: "#e1ffb5" }),
    );
    dot.position.y = 0.35;
    marker.add(dot);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.2, 48),
      new THREE.MeshBasicMaterial({
        color: "#ddf6ad",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.045;
    marker.add(halo);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.013, 0.25, 8),
      new THREE.MeshBasicMaterial({ color: "#d3e5a6" }),
    );
    stem.position.y = 0.2;
    marker.add(stem);
    scene.add(marker);
    const trailGeo = new THREE.BufferGeometry();
    const trail = new THREE.Line(
      trailGeo,
      new THREE.LineDashedMaterial({
        color: "#cee4ac",
        dashSize: 0.08,
        gapSize: 0.06,
        transparent: true,
        opacity: 0.55,
      }),
    );
    scene.add(trail);
    let raf = 0,
      last: ScenarioSample | null = null,
      dirty = true;
    controls.addEventListener("change", () => (dirty = true));
    const size = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    function draw() {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const s = latest.current;
      if (last === s && !dirty) return;
      last = s;
      dirty = false;
      marker.visible = !!s.position;
      if (s.position) marker.position.set(s.position.x, 0, s.position.z);
      for (let i = 0; i < lines.length; i++) {
        const radius = 0.5 + (i + ((reduced ? 0 : s.time * 0.24) % 1)) * 0.62;
        lines[i].scale.set(radius, 1, radius);
      }
      const pts = s.position
        ? Array.from(
            { length: 25 },
            (_, i) =>
              new THREE.Vector3(
                -2.65 + ((s.position!.x + 2.65) * i) / 24,
                0.05,
                0.6 + ((s.position!.z - 0.6) * i) / 24,
              ),
          )
        : [];
      trail.geometry.dispose();
      trail.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      trail.computeLineDistances();
      renderer.render(scene, camera);
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      renderer.dispose();
      el.replaceChildren();
    };
  }, [resetKey, reduced, failed]);
  if (failed)
    return (
      <div
        className="room-fallback"
        role="img"
        aria-label="Illustrative 2D room plan"
      >
        <div className="floor-plan">
          <div className="sofa" />
          <div className="table" />
          <span className="node n1" />
          <span className="node n2" />
          <span className="node n3" />
          {sample.position && (
            <span
              className="position"
              style={{
                left: `${50 + sample.position.x * 10}%`,
                top: `${50 + sample.position.z * 12}%`,
              }}
            />
          )}
        </div>
        <span className="fallback-caption">2D room illustration</span>
      </div>
    );
  return <div ref={host} className="room-canvas" />;
}
