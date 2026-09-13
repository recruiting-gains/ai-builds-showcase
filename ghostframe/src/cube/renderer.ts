import {
  BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group,
  Matrix4, Mesh, OrthographicCamera, Points, Scene, ShaderMaterial, WebGLRenderer,
} from 'three';

const MAX_RENDER_EDGE = 768;
const PARTICLE_COUNT = 192;

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uAccent;
  varying vec2 vUv;
  varying vec3 vNormal;
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
  }
  void main() {
    // Low-opacity coherent grain gives the core depth while preserving the camera.
    float grain = noise(vUv * 44.0 + vec2(uTime * 0.12, -uTime * 0.08));
    float rim = pow(1.0 - abs(normalize(vNormal).z), 2.0);
    vec3 color = mix(uBase, uAccent, 0.35 + grain * 0.40);
    gl_FragColor = vec4(color, 0.045 + grain * 0.065 + rim * 0.025);
    #include <colorspace_fragment>
  }
`;

const cageFragmentShader = `
  uniform vec3 uAccent;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    // Screen-space derivatives keep edges crisp at every cube size. The narrow
    // halo lives on these same twelve edges; no blur buffers or glow meshes.
    vec2 edge = min(vUv, vec2(1.0) - vUv) / max(fwidth(vUv), vec2(0.00001));
    float pixels = min(edge.x, edge.y);
    float line = 1.0 - smoothstep(0.25, 1.25, pixels);
    float glow = (1.0 - smoothstep(0.5, 3.6, pixels)) * 0.12;
    float facing = gl_FrontFacing ? 1.0 : 0.60;
    float alpha = (line * 0.90 + glow) * uOpacity * facing;
    if (alpha < 0.003) discard;
    vec3 color = mix(uAccent, vec3(0.86, 0.96, 1.0), line * 0.94);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const particleVertexShader = `
  uniform float uTime;
  uniform float uPointScale;
  attribute float aSeed;
  varying float vLight;
  void main() {
    vec3 p = position;
    // A bounded, slow flow of the existing points; no CPU simulation or respawns.
    p += 0.009 * vec3(sin(p.y * 9.0 + uTime * 0.32),
      sin(p.z * 9.0 + uTime * 0.27), sin(p.x * 9.0 - uTime * 0.24));
    vLight = 0.48 + 0.28 * sin(aSeed * 6.28318 + uTime * 0.44);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.5 + aSeed * 1.8) * uPointScale;
  }
`;

const particleFragmentShader = `
  uniform vec3 uAccent;
  varying float vLight;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    float alpha = (1.0 - smoothstep(0.12, 0.5, radius)) * vLight;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(mix(uAccent, vec3(0.8, 0.95, 1.0), 0.38), alpha);
    #include <colorspace_fragment>
  }
`;

function particleGeometry(): BufferGeometry {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const seeds = new Float32Array(PARTICLE_COUNT);
  let seed = 7421;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < PARTICLE_COUNT; index++) {
    for (let axis = 0; axis < 3; axis++) positions[index * 3 + axis] = (random() - 0.5) * 0.53;
    seeds[index] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));
  return geometry;
}

/** Owns one transparent GPU layer; the caller owns the camera and paint loop. */
export class CubeRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  private readonly group = new Group();
  private readonly rotation = new Matrix4();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly particles = particleGeometry();
  private readonly accent = { value: new Color(0.035, 0.42, 1) };
  private readonly time = { value: 0 };
  private readonly fill = new ShaderMaterial({
    uniforms: {
      uTime: this.time,
      uBase: { value: new Color(0.015, 0.10, 0.60) },
      uAccent: this.accent,
    },
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    side: DoubleSide, forceSinglePass: true,
  });
  private readonly outline = new ShaderMaterial({
    uniforms: { uAccent: this.accent, uOpacity: { value: 0.92 } },
    vertexShader, fragmentShader: cageFragmentShader, transparent: true,
    depthWrite: false, side: DoubleSide, forceSinglePass: true,
  });
  private readonly innerOutline = new ShaderMaterial({
    uniforms: { uAccent: this.accent, uOpacity: { value: 0.24 } },
    vertexShader, fragmentShader: cageFragmentShader, transparent: true,
    depthWrite: false, side: DoubleSide, forceSinglePass: true,
  });
  private readonly particleMaterial = new ShaderMaterial({
    uniforms: { uAccent: this.accent, uTime: this.time, uPointScale: { value: 1 } },
    vertexShader: particleVertexShader, fragmentShader: particleFragmentShader,
    transparent: true, depthWrite: false,
  });
  private renderer: WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private disposed = false;
  private failed = false;
  private released = false;
  private shaderFailed = false;
  private width = 0;
  private height = 0;
  private preset = -1;

  private readonly contextLost = (event: Event): void => {
    event.preventDefault();
    this.unavailable('Cube graphics were interrupted. Retry graphics or choose another mode.');
  };

  constructor(private readonly onUnavailable: (message: string) => void) {
    try {
      this.canvas = document.createElement('canvas');
      this.renderer = new WebGLRenderer({
        canvas: this.canvas, alpha: true, antialias: true,
        premultipliedAlpha: true, preserveDrawingBuffer: false,
        powerPreference: 'low-power', depth: true, stencil: false,
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.debug.onShaderError = () => { this.shaderFailed = true; };
      this.canvas.addEventListener('webglcontextlost', this.contextLost);
      this.camera.position.z = 4;
      const core = new Mesh(this.box, this.fill);
      core.scale.setScalar(0.58);
      const motes = new Points(this.particles, this.particleMaterial);
      const innerCage = new Mesh(this.box, this.innerOutline);
      innerCage.scale.setScalar(0.70);
      const outerCage = new Mesh(this.box, this.outline);
      core.renderOrder = 0;
      motes.renderOrder = 1;
      innerCage.renderOrder = 2;
      outerCage.renderOrder = 3;
      this.group.add(core, motes, innerCage, outerCage);
      this.scene.add(this.group);
      this.renderer.compile(this.scene, this.camera);
      if (this.shaderFailed) this.unavailable('Cube graphics could not start. Try another mode.');
    } catch {
      this.unavailable('Cube graphics are unavailable in this browser. Try another mode.');
    }
  }

  /** Draw immediately after the camera. x/y are final display coordinates. */
  draw(
    ctx: CanvasRenderingContext2D,
    pose: { x: number; y: number; size: number },
    preset: number,
    now: number,
    reducedMotion = false,
  ): boolean {
    const renderer = this.renderer;
    if (this.disposed || this.failed || !renderer || !this.canvas) return false;
    const width = ctx.canvas.width, height = ctx.canvas.height;
    if (width < 1 || height < 1 || !Number.isFinite(pose.x)
      || !Number.isFinite(pose.y) || !Number.isFinite(pose.size)) return false;
    try {
      if (renderer.getContext().isContextLost()) {
        this.unavailable('Cube graphics were interrupted. Retry graphics or choose another mode.');
        return false;
      }
      if (width !== this.width || height !== this.height) {
        this.width = width;
        this.height = height;
        const reduction = Math.min(1, MAX_RENDER_EDGE / Math.max(width, height));
        renderer.setSize(Math.max(1, Math.round(width * reduction)),
          Math.max(1, Math.round(height * reduction)), false);
        const shortest = Math.min(width, height);
        this.camera.left = -width / shortest / 2;
        this.camera.right = width / shortest / 2;
        this.camera.top = height / shortest / 2;
        this.camera.bottom = -height / shortest / 2;
        this.camera.updateProjectionMatrix();
      }
      const selectedPreset = preset === 1 ? 1 : 0;
      if (selectedPreset !== this.preset) {
        this.preset = selectedPreset;
        this.fill.uniforms.uBase.value.setRGB(
          selectedPreset ? 0.40 : 0.015, selectedPreset ? 0.025 : 0.10, 0.60);
      this.accent.value.setRGB(
          selectedPreset ? 0.55 : 0.035, selectedPreset ? 0.08 : 0.42, 1);
      }
      const time = reducedMotion || !Number.isFinite(now) ? 0 : now / 1000;
      this.time.value = time;
      const shortest = Math.min(width, height);
      this.group.position.set(
        (Math.min(1, Math.max(0, pose.x)) - 0.5) * width / shortest,
        (0.5 - Math.min(1, Math.max(0, pose.y))) * height / shortest, 0);
      this.group.rotation.set(0.32 + Math.sin(time * 0.28) * 0.045,
        0.55 + Math.sin(time * 0.20) * 0.09, 0.02);
      // pose.size bounds the complete projected cage, not an oversized rotated
      // cube side. The layer spacing therefore stays inside the same hand span.
      this.rotation.makeRotationFromEuler(this.group.rotation);
      const elements = this.rotation.elements;
      const projectedWidth = Math.abs(elements[0]) + Math.abs(elements[4]) + Math.abs(elements[8]);
      const projectedHeight = Math.abs(elements[1]) + Math.abs(elements[5]) + Math.abs(elements[9]);
      const size = Math.min(0.7, Math.max(0.04, pose.size));
      this.group.scale.setScalar(size / Math.max(projectedWidth, projectedHeight));
      this.particleMaterial.uniforms.uPointScale.value = Math.min(1.35,
        Math.max(0.65, Math.min(this.canvas.width, this.canvas.height) * size / 180));
      renderer.render(this.scene, this.camera);
      if (this.shaderFailed) {
        this.unavailable('Cube graphics could not render. Try another mode.');
        return false;
      }
      // The recorder captures this 2D canvas. Copy synchronously before WebGL's
      // default drawing buffer can be cleared; no second visible overlay exists.
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.canvas, 0, 0, width, height);
      } finally {
        ctx.restore();
      }
      return true;
    } catch {
      this.unavailable('Cube graphics could not render. Retry graphics or choose another mode.');
      return false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }

  private unavailable(message: string): void {
    if (this.disposed || this.failed) return;
    this.failed = true;
    this.release();
    this.onUnavailable(message);
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    this.canvas?.removeEventListener('webglcontextlost', this.contextLost);
    this.box.dispose();
    this.particles.dispose();
    this.fill.dispose();
    this.outline.dispose();
    this.innerOutline.dispose();
    this.particleMaterial.dispose();
    this.scene.clear();
    const renderer = this.renderer;
    this.renderer = null;
    if (renderer) {
      try {
        // dispose removes Three's context-restored listener: recovery is explicit.
        renderer.dispose();
        if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      } catch { /* A lost context must not break camera or other modes. */ }
    }
    if (this.canvas) this.canvas.width = this.canvas.height = 1;
    this.canvas = null;
  }
}
