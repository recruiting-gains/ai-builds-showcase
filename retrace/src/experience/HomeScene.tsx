import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createSurfaceLibrary } from "./sceneMaterials";
import { createPresence, createRouter, createVisitors, createPorchLantern, ROUTER_ORIGIN } from "./sceneDetails";

type Props = {
  progress: number; reduced: boolean; paused: boolean; explore: boolean; replay: boolean;
  position: { x: number; z: number } | null;
  onReady: () => void; onFail: () => void; onExitExplore: () => void;
};
const clamp = (n: number) => THREE.MathUtils.clamp(n, 0, 1);
const smooth = (n: number) => { n = clamp(n); return n * n * (3 - 2 * n); };
const poses = [
  { p: 0, eye: [16, 6.5, 21], target: [-3.3, 1.15, .9] },
  { p: .16, eye: [13.4, 6.1, 18.5], target: [-3.1, 1.2, 1.1] },
  { p: .38, eye: [12.8, 15.6, 18.4], target: [-3.1, 1.2, .6] },
  { p: .51, eye: [10.2, 12.1, 14.4], target: [-1.9, 1, 1.4] },
  { p: .66, eye: [13.5, 21.5, 20], target: [-3.4, 1, .9] },
  { p: 1, eye: [14.2, 22.5, 21.5], target: [-4.5, 1.4, .4] },
];

export default function HomeScene(props: Props) {
  const host = useRef<HTMLDivElement>(null), callout = useRef<HTMLDivElement>(null);
  const latest = useRef(props), invalidate = useRef<() => void>(() => {});
  const syncExploreMode = useRef<() => void>(() => {});
  latest.current = props;
  useLayoutEffect(() => { syncExploreMode.current(); }, [props.explore]);
  useEffect(() => { invalidate.current(); }, [props.progress, props.reduced, props.paused, props.explore, props.replay, props.position]);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch { latest.current.onFail(); return; }
    const compact = () => el.clientWidth < 700;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "Midnight home and two visitors outside. In the cutaway, simulated wavefronts expand from the visible Wi-Fi router. Explore in 3D enables keyboard and pointer orbit.");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060b10, .027);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 140);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.enablePan = false; controls.enableZoom = false;
    controls.minPolarAngle = .18; controls.maxPolarAngle = 1.42;
    controls.enabled = false;
    renderer.domElement.style.touchAction = "pan-y";
    const pmrem = new THREE.PMREMGenerator(renderer), roomEnvironment = new RoomEnvironment();
    const environment = pmrem.fromScene(roomEnvironment, .06);
    roomEnvironment.dispose();
    scene.environment = environment.texture; scene.environmentIntensity = .12;
    const hemisphere = new THREE.HemisphereLight(0x9db6d0, 0x11140f, .32); scene.add(hemisphere);
    const moon = new THREE.DirectionalLight(0xb4cbe1, 1.6);
    moon.position.set(-7, 14, -3); moon.castShadow = true;
    moon.shadow.mapSize.set(compact() ? 1024 : 2048, compact() ? 1024 : 2048);
    moon.shadow.camera.left = -10; moon.shadow.camera.right = 10;
    moon.shadow.camera.top = 10; moon.shadow.camera.bottom = -10;
    moon.shadow.camera.near = .5; moon.shadow.camera.far = 40;
    moon.shadow.normalBias = .026; moon.shadow.bias = -.00015; moon.shadow.radius = 3;
    moon.target.position.set(0, 0, 1); scene.add(moon, moon.target);
    const rim = new THREE.DirectionalLight(0x7da1c5, .38); rim.position.set(8, 5, -8); scene.add(rim);
    // Exterior-directed porch light keeps the unlit room dark on mobile as well.
    const porch = new THREE.SpotLight(0xffc18a, 110, 8, Math.PI / 3.6, .85, 2);
    porch.position.set(.8, 2.74, 3.82); porch.target.position.set(.8, .1, 4.8);
    porch.castShadow = false; scene.add(porch, porch.target);
    const threshold = new THREE.PointLight(0xffb56f, 6.8, 2.8, 2);
    threshold.position.set(-.10, 2.07, 3.91); scene.add(threshold);
    const surfaces = createSurfaceLibrary(renderer);
    const groundMaterial = new THREE.MeshStandardMaterial({ name: "honed_limestone", color: 0x10171c, roughness: .9 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMaterial);
    surfaces.apply(ground); ground.rotation.x = -Math.PI / 2; ground.position.y = -.048;
    ground.receiveShadow = true; scene.add(ground);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 18, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,.72)"); gradient.addColorStop(.65, "rgba(0,0,0,.36)"); gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
    const contactTexture = new THREE.CanvasTexture(canvas);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(15, 12), new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2; contact.position.set(0, -.04, 1); scene.add(contact);
    const visitors = createVisitors(), router = createRouter(), presence = createPresence(); scene.add(visitors, router, presence);
    const routerLight = new THREE.PointLight(0xc5dcd8, 0, 2.7, 2);
    routerLight.position.copy(ROUTER_ORIGIN).add(new THREE.Vector3(0, .55, .55)); scene.add(routerLight);
    const sourceHalo = new THREE.Mesh(new THREE.RingGeometry(.16, .18, 48), new THREE.MeshBasicMaterial({ color: 0xade4d7, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
    sourceHalo.rotation.x = -Math.PI / 2; sourceHalo.position.copy(ROUTER_ORIGIN); scene.add(sourceHalo);
    // World-space wavefronts clipped at the floor, centred on the actual router.
    const waveGeometry = new THREE.SphereGeometry(1, 48, 24);
    const waves = Array.from({ length: 3 }, () => {
      const material = new THREE.ShaderMaterial({
        uniforms: { opacity: { value: 0 } }, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; void main(){vec4 world=modelMatrix*vec4(position,1.0);vec4 view=viewMatrix*world;vWorld=world.xyz;vNormal=normalize(normalMatrix*normal);vView=normalize(-view.xyz);gl_Position=projectionMatrix*view;}`,
        fragmentShader: `uniform float opacity;varying vec3 vNormal;varying vec3 vView;varying vec3 vWorld;void main(){if(vWorld.y<0.325)discard;float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),2.8);float floorEdge=1.0-smoothstep(0.33,0.40,vWorld.y);float a=(0.008+rim*0.17+floorEdge*0.12)*opacity;gl_FragColor=vec4(vec3(0.43,0.78,0.79),a);}`,
      });
      const shell = new THREE.Mesh(waveGeometry, material); shell.position.copy(ROUTER_ORIGIN); scene.add(shell);
      return { shell, material };
    });
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.10, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf0d1a6 })); scene.add(marker);
    type FadePart = { group: THREE.Object3D; baseY: number; materials: { mesh: THREE.Mesh; material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }[] };
    const roofs: FadePart[] = [], facades: FadePart[] = [];
    let model: THREE.Group | null = null, alive = true, revision = 0;
    const disposeModel = (object: THREE.Object3D) => object.traverse(child => {
      if (child instanceof THREE.Mesh) { child.geometry.dispose(); (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => m.dispose()); }
    });
    new GLTFLoader().load("/models/retrace-home.glb", gltf => {
      if (!alive) { disposeModel(gltf.scene); return; }
      model = gltf.scene;
      model.traverse(object => { if (object instanceof THREE.Mesh) { surfaces.apply(object); object.castShadow = object.receiveShadow = true; } });
      for (const group of model.children) {
        if (!/retrace_roof|cutaway_/.test(group.name)) continue;
        const part: FadePart = { group, baseY: group.position.y, materials: [] };
        group.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          object.material = Array.isArray(object.material) ? object.material.map(material => material.clone()) : object.material.clone();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) part.materials.push({ mesh: object, material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
        });
        (group.name.includes("retrace_roof") ? roofs : facades).push(part);
      }
      model.getObjectByName("cutaway_front")?.add(createPorchLantern());
      // Include the lantern in the same façade fade contract.
      const facade = facades.find(part => part.group.name === "cutaway_front");
      facade?.group.getObjectByName("porch-lantern")?.traverse(object => {
        if (object instanceof THREE.Mesh) facade.materials.push({ mesh: object, material: object.material, opacity: object.material.opacity, transparent: object.material.transparent, depthWrite: object.material.depthWrite });
      });
      scene.add(model); revision++; lastOpen = -1; renderer.shadowMap.needsUpdate = true;
      el.dataset.modelReady = "true"; latest.current.onReady(); requestRender();
    }, undefined, () => { if (alive) latest.current.onFail(); });
    let width = 0, height = 0, current = -1, frame = 0, visible = true;
    let pulseTime = 0, renderCount = 0;
    let lastTime = 0, lastRender = 0, lastSignature = "", lastOpen = -1, orbitDirty = false;
    const eye = new THREE.Vector3(), target = new THREE.Vector3(), projected = new THREE.Vector3();
    function requestRender() { if (alive && !frame) frame = requestAnimationFrame(draw); }
    invalidate.current = requestRender;
    function resize() {
      width = Math.max(1, el.clientWidth); height = Math.max(1, el.clientHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, compact() ? 1.25 : 1.6));
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      revision++; renderer.shadowMap.needsUpdate = true; requestRender();
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(el); resize();
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) requestRender(); }, { rootMargin: "100px" }); observer.observe(el);
    const visibilityChange = () => { if (!document.hidden) { lastTime = performance.now(); requestRender(); } };
    document.addEventListener("visibilitychange", visibilityChange);
    const orbitChange = () => { orbitDirty = true; requestRender(); }; controls.addEventListener("change", orbitChange);
    // Keyboard access must not wait for an expensive or suspended WebGL frame.
    // The last rendered target matches the camera pose the visitor can see.
    syncExploreMode.current = () => {
      const exploring = latest.current.explore;
      if (exploring) controls.target.copy(target);
      controls.enabled = exploring;
      renderer.domElement.style.touchAction = exploring ? "none" : "pan-y";
      renderer.domElement.tabIndex = exploring ? 0 : -1;
      if (exploring) {
        renderer.domElement.focus({ preventScroll: true });
        controls.update();
      }
      requestRender();
    };
    syncExploreMode.current();
    const keydown = (event: KeyboardEvent) => {
      if (!latest.current.explore) return;
      if (event.key === "Escape") { event.preventDefault(); latest.current.onExitExplore(); return; }
      const rotations: Record<string, [number, number]> = { ArrowLeft: [.08, 0], ArrowRight: [-.08, 0], ArrowUp: [0, -.06], ArrowDown: [0, .06] };
      if (!rotations[event.key]) return;
      event.preventDefault();
      const offset = camera.position.clone().sub(controls.target), spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += rotations[event.key][0]; spherical.phi = THREE.MathUtils.clamp(spherical.phi + rotations[event.key][1], .18, 1.42);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); controls.update(); orbitChange();
    };
    renderer.domElement.addEventListener("keydown", keydown);
    function fade(part: FadePart, amount: number, lift = 0) {
      part.group.visible = amount > .008; part.group.position.y = part.baseY + lift;
      for (const entry of part.materials) {
        entry.mesh.castShadow = amount > .72;
        const transparent = entry.transparent || amount < .999;
        if (entry.material.transparent !== transparent) { entry.material.transparent = transparent; entry.material.needsUpdate = true; }
        entry.material.opacity = entry.opacity * amount; entry.material.depthWrite = entry.depthWrite && amount > .92;
      }
    }
    function draw(now: number) {
      frame = 0;
      if (!alive || document.hidden || !visible) return;
      const state = latest.current, dt = Math.min(.12, Math.max(.016, (now - lastTime) / 1000)); lastTime = now;
      current = current < 0 || state.reduced ? state.progress : THREE.MathUtils.damp(current, state.progress, 8, dt);
      if (Math.abs(current - state.progress) < .00015) current = state.progress;
      const q = state.reduced ? (state.progress < .2 ? 0 : state.progress < .5 ? .38 : state.progress < .78 ? .66 : .94) : current;
      const reveal = smooth((q - .46) / .075) * (1 - smooth((q - .755) / .055));
      const pulsing = reveal > .002 && !state.reduced && !state.paused, moving = current !== state.progress;
      if (pulsing && now - lastRender < (compact() ? 50 : 33)) { requestRender(); return; }
      if (pulsing) pulseTime += Math.min(.15, (now - lastRender) / 1000) / 5.6;
      const phase = pulseTime;
      const signature = [q.toFixed(4), state.reduced, state.paused, width, height, state.explore, state.replay, state.position?.x, state.position?.z, revision, pulsing ? Math.floor(now / 33) : 0].join("|");
      if (signature === lastSignature && !orbitDirty) { if (moving || pulsing) requestRender(); return; }
      const right = poses.findIndex(pose => pose.p >= q);
      const index = Math.max(1, right < 0 ? poses.length - 1 : right), a = poses[index - 1], b = poses[index];
      const blend = smooth((q - a.p) / (b.p - a.p));
      eye.fromArray(a.eye).lerp(new THREE.Vector3().fromArray(b.eye), blend);
      target.fromArray(a.target).lerp(new THREE.Vector3().fromArray(b.target), blend);
      if (compact()) { const move = smooth((q - .13) / .18); eye.multiplyScalar(1.11 + move * .05); target.set(.3, 1.1, 1.25 - move * .15); }
      if (!state.explore) { camera.position.copy(eye); camera.lookAt(target); }
      const open = smooth((q - .20) / .235);
      if (Math.abs(open - lastOpen) > .0005) {
        roofs.forEach(part => fade(part, 1 - smooth(open / .8), open * 1.25));
        facades.forEach(part => fade(part, 1 - smooth((open - .15) / .85)));
        renderer.shadowMap.needsUpdate = true; lastOpen = open;
      }
      hemisphere.intensity = .32 + open * .14;
      threshold.intensity = 6.8 * (1 - open * .75);
      presence.visible = reveal > .01; presence.scale.setScalar(.94 + .06 * smooth((q - .54) / .07));
      for (const child of presence.children) if (child instanceof THREE.Mesh) (child.material as THREE.MeshBasicMaterial).opacity = reveal * .7;
      routerLight.intensity = reveal * 2.5;
      sourceHalo.visible = reveal > .01; sourceHalo.scale.setScalar(1 + (state.reduced ? .15 : (Math.sin(phase * Math.PI * 8) + 1) * .13));
      (sourceHalo.material as THREE.MeshBasicMaterial).opacity = reveal * .68;
      waves.forEach(({ shell, material }, i) => {
        const cycle = state.reduced ? [.19, .47, .76][i] : (phase + i / 3) % 1;
        shell.visible = reveal > .001; shell.scale.setScalar(.15 + cycle * 8.7);
        material.uniforms.opacity.value = reveal * smooth(cycle / .10) * (1 - smooth((cycle - .76) / .24));
      });
      marker.visible = state.replay && !!state.position;
      if (state.position) marker.position.set(state.position.x, .55, state.position.z);
      if (callout.current) {
        camera.updateMatrixWorld();
        projected.copy(ROUTER_ORIGIN).project(camera);
        const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
        callout.current.style.left = `${THREE.MathUtils.clamp(x, 92, width - 92)}px`;
        callout.current.style.top = `${y - 30}px`;
        callout.current.style.opacity = reveal > .35 && !state.explore ? "1" : "0";
      }
      renderer.render(scene, camera);
      el.dataset.frameCount = String(++renderCount);
      el.dataset.motionPaused = String(state.paused || state.reduced);
      el.dataset.sceneSettled = String(!moving);
      el.dataset.drawCalls = String(renderer.info.render.calls); el.dataset.triangles = String(renderer.info.render.triangles);
      el.dataset.renderProgress = q.toFixed(4); el.dataset.routerOrigin = ROUTER_ORIGIN.toArray().join(",");
      lastRender = now; lastSignature = signature; orbitDirty = false;
      if (moving || pulsing) requestRender();
    }
    const lost = (event: Event) => { event.preventDefault(); latest.current.onFail(); };
    renderer.domElement.addEventListener("webglcontextlost", lost); requestRender();
    return () => {
      alive = false; invalidate.current = () => {}; syncExploreMode.current = () => {}; cancelAnimationFrame(frame);
      resizeObserver.disconnect(); observer.disconnect(); document.removeEventListener("visibilitychange", visibilityChange);
      renderer.domElement.removeEventListener("keydown", keydown); renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.removeEventListener("change", orbitChange); controls.dispose();
      disposeModel(scene); surfaces.dispose(); contactTexture.dispose(); environment.dispose(); pmrem.dispose(); moon.shadow.dispose(); renderer.dispose(); el.replaceChildren();
    };
  }, []);
  return <div className="rt-canvas-host">
    <div ref={host} className="rt-renderer" />
    <div ref={callout} className="rt-router-callout" aria-hidden="true"><span>Wi-Fi router</span><small>SIMULATED EMISSION</small><i /></div>
  </div>;
}
