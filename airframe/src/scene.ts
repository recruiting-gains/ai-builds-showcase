import * as THREE from 'three';

export function createScene(canvas: HTMLCanvasElement, onFallback: () => void) {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { onFallback(); return { aim() {}, dispose() {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a151c, .055);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  camera.position.set(0, 3.4, 8.8); camera.lookAt(0, .2, 0);
  const group = new THREE.Group(); scene.add(group);
  scene.add(new THREE.HemisphereLight(0xb2f6ed, 0x172839, 2));
  const light = new THREE.PointLight(0x65f1ca, 9, 20); light.position.set(0, 2, 3); scene.add(light);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.66, 0), new THREE.MeshStandardMaterial({ color: 0x66c6b1, metalness: .75, roughness: .3, emissive: 0x185d51, emissiveIntensity: .6, transparent: true, opacity: .76 }));
  core.add(new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry), new THREE.LineBasicMaterial({ color: 0x95ffe0, transparent: true, opacity: .75 })));
  core.position.y = .35; group.add(core);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * .39, .009, 6, 96), new THREE.MeshBasicMaterial({ color: i === 2 ? 0xb9d7ef : 0x6eebc9, transparent: true, opacity: .36 + i * .08 }));
    ring.rotation.x = Math.PI / 2 - i * .27; ring.rotation.y = i * .32; ring.position.y = .3; group.add(ring); rings.push(ring);
  }
  const floor = new THREE.GridHelper(24, 40, 0x2d6b63, 0x16332f); floor.position.y = -1.4;
  (floor.material as THREE.Material).transparent = true; (floor.material as THREE.Material).opacity = .45; scene.add(floor);
  const points = new Float32Array(84 * 3);
  for (let i = 0; i < points.length; i += 3) { points[i] = Math.sin(i * 13.8) * 7; points[i + 1] = Math.cos(i * 4.4) * 4; points[i + 2] = Math.sin(i * 2.9) * 4 - 2; }
  const particles = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3)), new THREE.PointsMaterial({ color: 0xa4d7d0, size: .024, transparent: true, opacity: .55 })); scene.add(particles);
  let aimX = 0, aimY = 0, frame = 0, disposed = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const size = () => { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(size); observer.observe(canvas); size();
  const draw = (t: number) => {
    if (disposed) return;
    if (!document.hidden) {
      if (!reduced.matches) { core.rotation.y = t * .00012; core.rotation.z = Math.sin(t * .0003) * .13; group.position.y = Math.sin(t * .0007) * .08; rings[1].rotation.z = t * .00005; }
      group.rotation.y += (aimX * .22 - group.rotation.y) * .06;
      group.rotation.x += (aimY * .12 - group.rotation.x) * .06;
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return {
    aim(x: number, y: number) { aimX = x - .5; aimY = y - .5; },
    dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) { o.geometry.dispose(); const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => m.dispose()); } }); renderer.dispose(); }
  };
}
