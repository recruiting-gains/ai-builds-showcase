import {
  BoxGeometry, Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments,
  Mesh, OrthographicCamera, Scene, ShaderMaterial, WebGLRenderer,
} from 'three';

const MAX_RENDER_EDGE = 768;

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
  void main() {
    // Smooth moving bands give the solid faces texture without a texture upload.
    float bands = sin(vUv.x * 31.0 + sin(vUv.y * 19.0 + uTime * 0.45) * 2.8
      + uTime * 0.6) * sin(vUv.y * 27.0 - uTime * 0.32);
    float light = 0.70 + 0.30 * max(0.0, dot(normalize(vNormal),
      normalize(vec3(-0.35, 0.65, 1.0))));
    vec3 color = mix(uBase, uAccent, 0.32 + 0.32 * bands) * light;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Owns one transparent GPU layer; the caller owns the camera and paint loop. */
export class CubeRenderer {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  private readonly group = new Group();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly edges = new EdgesGeometry(this.box);
  private readonly fill = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBase: { value: new Color(0.035, 0.13, 0.52) },
      uAccent: { value: new Color(0.08, 0.55, 1) },
    },
    vertexShader, fragmentShader,
  });
  private readonly outline = new LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.92,
    depthTest: false, depthWrite: false,
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
      const mesh = new Mesh(this.box, this.fill);
      const wireframe = new LineSegments(this.edges, this.outline);
      wireframe.scale.setScalar(1.015);
      wireframe.renderOrder = 1;
      this.group.add(mesh, wireframe);
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
          selectedPreset ? 0.24 : 0.035, selectedPreset ? 0.04 : 0.13, 0.52);
        this.fill.uniforms.uAccent.value.setRGB(
          selectedPreset ? 0.04 : 0.08, selectedPreset ? 0.95 : 0.55, 1);
      }
      const time = reducedMotion || !Number.isFinite(now) ? 0 : (now % 120000) / 1000;
      this.fill.uniforms.uTime.value = time;
      const shortest = Math.min(width, height);
      this.group.position.set(
        (Math.min(1, Math.max(0, pose.x)) - 0.5) * width / shortest,
        (0.5 - Math.min(1, Math.max(0, pose.y))) * height / shortest, 0);
      this.group.scale.setScalar(Math.min(0.7, Math.max(0.04, pose.size)));
      this.group.rotation.set(0.32 + Math.sin(time * 0.28) * 0.045,
        0.55 + Math.sin(time * 0.20) * 0.09, 0.02);
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
    this.edges.dispose();
    this.fill.dispose();
    this.outline.dispose();
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
