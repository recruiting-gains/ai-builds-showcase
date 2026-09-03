import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type {
  CityEdge,
  CityNode,
  CitySnapshot,
  District,
  EdgeKind,
} from "../shared/contracts";

export type CityDistrictFilter = District | "all";
export type CityRenderQuality = "auto" | "low" | "high";

export interface CityVisualizationData {
  nodes: readonly CityNode[];
  edges: readonly CityEdge[];
}

export interface CitySelectionOptions {
  flyTo?: boolean;
  notify?: boolean;
}

export interface CityVisualizationOptions {
  /** Host element whose size controls the WebGL canvas. */
  container: HTMLElement;
  /** Optional first city. A full API snapshot can be passed directly. */
  data?: CityVisualizationData | Pick<CitySnapshot, "nodes" | "edges">;
  /** Runs the first city's construction animation. Defaults to true. */
  animateInitial?: boolean;
  /** Rendering budget. "auto" reduces detail on small/touch devices. */
  quality?: CityRenderQuality;
  /** Maximum renderer pixel ratio. Defaults to 1.5 (1.25 in low quality). */
  maxPixelRatio?: number;
  /** Called after a building or empty ground is clicked. */
  onSelectNode?: (node: CityNode | null) => void;
  /** Called when the pointer enters or leaves a building. */
  onHoverNode?: (node: CityNode | null) => void;
}

export interface CityVisualizationController {
  readonly canvas: HTMLCanvasElement;
  setData(data: CityVisualizationData | Pick<CitySnapshot, "nodes" | "edges">): void;
  selectNode(nodeId: string | null, options?: CitySelectionOptions): void;
  flyToNode(nodeId: string): boolean;
  resetView(animate?: boolean): void;
  setMotion(enabled: boolean): void;
  setSuspended(suspended: boolean): void;
  setDistrictFilter(filter: CityDistrictFilter): void;
  dispose(): void;
}

interface BuildingRecord {
  node: CityNode;
  group: THREE.Group;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  height: number;
}

interface RiseAnimation {
  group: THREE.Group;
  startedAt: number;
  duration: number;
}

interface CameraAnimation {
  startedAt: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
}

interface DistrictStyle {
  color: number;
  emissive: number;
  center: readonly [number, number];
}

const DISTRICT_STYLES: Record<District, DistrictStyle> = {
  concepts: { color: 0x9e7cff, emissive: 0x21164e, center: [-4.1, -3.2] },
  skills: { color: 0x39dec0, emissive: 0x073d38, center: [4.1, -3.2] },
  evidence: { color: 0xffc15d, emissive: 0x4a2b08, center: [-4.1, 3.2] },
  questions: { color: 0xff7388, emissive: 0x4b101e, center: [4.1, 3.2] },
};

const EDGE_COLORS: Record<EdgeKind, number> = {
  related: 0x9d8dff,
  supports: 0xffcc72,
  questions: 0xff788d,
  applies: 0x46dfc3,
};

const HOME_POSITION = new THREE.Vector3(15.5, 15.2, 19.5);
const HOME_TARGET = new THREE.Vector3(0, 0.3, 0);
const UP = new THREE.Vector3(0, 1, 0);
const EMPTY_DATA: CityVisualizationData = { nodes: [], edges: [] };
const TAU = Math.PI * 2;
const ISLAND_RADIUS = 10.8;

/**
 * Creates the interactive Memory City scene. The caller owns the surrounding
 * interface and accessible list; this module owns only its canvas and WebGL life cycle.
 */
export function createMemoryCityVisualization(
  options: CityVisualizationOptions,
): CityVisualizationController {
  return new MemoryCityVisualization(options);
}

export class MemoryCityVisualization implements CityVisualizationController {
  readonly canvas: HTMLCanvasElement;

  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cityGroup = new THREE.Group();
  private readonly roadsGroup = new THREE.Group();
  private readonly buildingsGroup = new THREE.Group();
  private readonly atmosphereGroup = new THREE.Group();
  private readonly animatedCore = new THREE.Group();
  private readonly buildings = new Map<string, BuildingRecord>();
  private readonly hitTargets: THREE.Object3D[] = [];
  private readonly transientGeometries = new Set<THREE.BufferGeometry>();
  private readonly transientMaterials = new Set<THREE.Material>();
  private readonly riseAnimations: RiseAnimation[] = [];
  private readonly clock = new THREE.Clock(false);
  private readonly reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly resizeObserver: ResizeObserver;
  private readonly intersectionObserver: IntersectionObserver;
  private readonly quality: Exclude<CityRenderQuality, "auto">;
  private readonly maxPixelRatio: number;
  private readonly onSelectNode: ((node: CityNode | null) => void) | undefined;
  private readonly onHoverNode: ((node: CityNode | null) => void) | undefined;
  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly sharedMaterials: THREE.Material[] = [];

  private data: CityVisualizationData = EMPTY_DATA;
  private selectedNodeId: string | null = null;
  private hoveredNodeId: string | null = null;
  private districtFilter: CityDistrictFilter = "all";
  private cameraAnimation: CameraAnimation | null = null;
  private frameHandle: number | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private isIntersecting = true;
  private isDocumentVisible = !document.hidden;
  private isSuspended = false;
  private isDisposed = false;
  private needsRender = true;
  private motionEnabled: boolean;
  private manualMotionPreference = false;
  private elapsed = 0;
  private renderWidth = 1;
  private renderHeight = 1;
  private initialDataApplied = false;

  private readonly unitBox: THREE.BoxGeometry;
  private readonly unitCylinder: THREE.CylinderGeometry;
  private readonly windowGeometry: THREE.BoxGeometry;
  private readonly windowMaterial: THREE.MeshBasicMaterial;
  private readonly districtMaterials: Record<District, THREE.MeshStandardMaterial>;

  constructor(options: CityVisualizationOptions) {
    this.container = options.container;
    this.onSelectNode = options.onSelectNode;
    this.onHoverNode = options.onHoverNode;
    this.quality = resolveQuality(options.quality ?? "auto");
    this.maxPixelRatio = Math.max(
      0.75,
      Math.min(options.maxPixelRatio ?? (this.quality === "low" ? 1.25 : 1.5), 2),
    );
    this.motionEnabled = !this.reducedMotionQuery.matches;

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: this.quality === "high",
      powerPreference: this.quality === "low" ? "low-power" : "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = this.quality === "high";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.cursor = "grab";
    this.container.append(this.canvas);

    this.camera = new THREE.OrthographicCamera(-9, 9, 9, -9, 0.1, 160);
    this.camera.position.copy(HOME_POSITION);
    this.camera.lookAt(HOME_TARGET);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(HOME_TARGET);
    this.controls.enableDamping = this.motionEnabled;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minZoom = 0.62;
    this.controls.maxZoom = 2.2;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.7;
    // OrbitControls defaults to `touch-action: none`, which traps the page on
    // phones. `pan-y` lets a one-finger vertical gesture keep scrolling the
    // document while horizontal drags can still orbit the city.
    this.canvas.style.touchAction = window.matchMedia("(pointer: coarse)").matches
      ? "pan-y"
      : "none";
    this.controls.addEventListener("change", this.handleControlsChange);
    this.controls.addEventListener("start", this.handleControlsStart);
    this.controls.addEventListener("end", this.handleControlsEnd);

    this.unitBox = this.rememberGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.unitCylinder = this.rememberGeometry(new THREE.CylinderGeometry(1, 1, 1, 8));
    this.windowGeometry = this.rememberGeometry(new THREE.BoxGeometry(0.12, 0.12, 0.025));
    this.windowMaterial = this.rememberMaterial(
      new THREE.MeshBasicMaterial({ color: 0xffdda0, toneMapped: false }),
    );
    this.districtMaterials = {
      concepts: this.createDistrictMaterial("concepts"),
      skills: this.createDistrictMaterial("skills"),
      evidence: this.createDistrictMaterial("evidence"),
      questions: this.createDistrictMaterial("questions"),
    };

    this.scene.fog = new THREE.FogExp2(0x080d1c, this.quality === "low" ? 0.02 : 0.016);
    this.cityGroup.name = "Memory City";
    this.roadsGroup.name = "Connections";
    this.buildingsGroup.name = "Ideas";
    this.atmosphereGroup.name = "Atmosphere";
    this.cityGroup.add(this.roadsGroup, this.buildingsGroup);
    this.scene.add(this.atmosphereGroup, this.cityGroup);

    this.buildWorld();

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.container);
    this.intersectionObserver = new IntersectionObserver(this.handleIntersection, {
      rootMargin: "120px",
      threshold: 0.01,
    });
    this.intersectionObserver.observe(this.container);

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.reducedMotionQuery.addEventListener("change", this.handleReducedMotionChange);

    this.handleResize();
    if (options.data) {
      this.setDataInternal(options.data, options.animateInitial ?? true);
    } else {
      this.renderOnce();
    }
    this.syncAnimationLoop();
  }

  setData(data: CityVisualizationData | Pick<CitySnapshot, "nodes" | "edges">): void {
    this.setDataInternal(data, true);
  }

  selectNode(nodeId: string | null, options: CitySelectionOptions = {}): void {
    const nextRecord = nodeId === null ? null : this.buildings.get(nodeId) ?? null;
    const nextId = nextRecord?.node.id ?? null;

    if (this.selectedNodeId === nextId) {
      if (nextRecord && options.flyTo) {
        this.flyToNode(nextRecord.node.id);
      }
      return;
    }

    const previous = this.selectedNodeId ? this.buildings.get(this.selectedNodeId) : undefined;
    if (previous) {
      previous.halo.visible = false;
      previous.beam.visible = false;
    }

    this.selectedNodeId = nextId;
    if (nextRecord) {
      nextRecord.halo.visible = true;
      nextRecord.beam.visible = true;
      if (options.flyTo) {
        this.flyToNode(nextRecord.node.id);
      }
    }

    this.requestRender();
    if (options.notify ?? true) {
      this.onSelectNode?.(nextRecord?.node ?? null);
    }
  }

  flyToNode(nodeId: string): boolean {
    const record = this.buildings.get(nodeId);
    if (!record || !record.group.visible) {
      return false;
    }

    const target = record.group.position.clone();
    target.y = Math.min(2.2, 0.55 + record.height * 0.32);
    const currentDirection = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    if (currentDirection.lengthSq() < 0.5) {
      currentDirection.copy(HOME_POSITION).sub(HOME_TARGET).normalize();
    }
    const distance = 10.5;
    const destination = target.clone().addScaledVector(currentDirection, distance);
    destination.y = Math.max(destination.y, target.y + 5.5);

    this.beginCameraAnimation(destination, target, 850, 1.34);
    return true;
  }

  resetView(animate = true): void {
    if (animate && this.motionEnabled) {
      this.beginCameraAnimation(HOME_POSITION, HOME_TARGET, 900, 1);
      return;
    }
    this.cameraAnimation = null;
    this.camera.position.copy(HOME_POSITION);
    this.controls.target.copy(HOME_TARGET);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  setMotion(enabled: boolean): void {
    this.manualMotionPreference = true;
    this.motionEnabled = enabled;
    this.controls.enableDamping = enabled;
    if (!enabled) {
      this.finishAnimationsImmediately();
    }
    this.requestRender();
    this.syncAnimationLoop();
  }

  setSuspended(suspended: boolean): void {
    if (this.isSuspended === suspended || this.isDisposed) {
      return;
    }
    this.isSuspended = suspended;
    if (suspended) {
      this.syncAnimationLoop();
      return;
    }
    this.requestRender();
    this.syncAnimationLoop();
  }

  setDistrictFilter(filter: CityDistrictFilter): void {
    if (filter !== "all" && !(filter in DISTRICT_STYLES)) {
      return;
    }
    if (this.districtFilter === filter) {
      return;
    }
    this.districtFilter = filter;
    this.applyDistrictFilter();
    if (
      this.selectedNodeId &&
      !this.buildings.get(this.selectedNodeId)?.group.visible
    ) {
      this.selectNode(null);
    }
    this.requestRender();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.controls.removeEventListener("change", this.handleControlsChange);
    this.controls.removeEventListener("start", this.handleControlsStart);
    this.controls.removeEventListener("end", this.handleControlsEnd);
    this.controls.dispose();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.reducedMotionQuery.removeEventListener("change", this.handleReducedMotionChange);

    this.clearDynamicCity();
    for (const geometry of this.sharedGeometries) {
      geometry.dispose();
    }
    for (const material of this.sharedMaterials) {
      material.dispose();
    }
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) {
        return;
      }
      if (!this.sharedGeometries.includes(object.geometry)) {
        object.geometry.dispose();
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!this.sharedMaterials.includes(material)) {
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.buildings.clear();
    this.hitTargets.length = 0;
  }

  private setDataInternal(
    data: CityVisualizationData | Pick<CitySnapshot, "nodes" | "edges">,
    animate: boolean,
  ): void {
    if (this.isDisposed) {
      return;
    }
    const previousIds = new Set(this.data.nodes.map((node) => node.id));
    const deduplicatedNodes = deduplicateNodes(data.nodes);
    const nodeIds = new Set(deduplicatedNodes.map((node) => node.id));
    const validEdges = data.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target,
    );
    this.data = { nodes: deduplicatedNodes, edges: validEdges };

    const retainedSelection =
      this.selectedNodeId && nodeIds.has(this.selectedNodeId) ? this.selectedNodeId : null;
    const selectionWasRemoved = this.selectedNodeId !== null && retainedSelection === null;
    if (this.hoveredNodeId !== null) {
      this.hoveredNodeId = null;
      this.canvas.style.cursor = "grab";
      this.onHoverNode?.(null);
    }
    this.clearDynamicCity();
    this.layoutAndBuildNodes(previousIds, animate);
    this.buildRoads();
    this.applyDistrictFilter();
    this.selectedNodeId = null;
    if (retainedSelection) {
      this.selectNode(retainedSelection, { notify: false });
    } else if (selectionWasRemoved) {
      this.onSelectNode?.(null);
    }

    this.initialDataApplied = true;
    this.requestRender();
    this.syncAnimationLoop();
  }

  private buildWorld(): void {
    this.scene.background = null;
    this.buildSky();
    this.buildLights();
    this.buildIsland();
    this.buildDistrictMarkers();
    this.buildMemoryCore();
  }

  private buildSky(): void {
    const skyGeometry = new THREE.SphereGeometry(75, this.quality === "low" ? 20 : 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        bottomColor: { value: new THREE.Color(0x070b18) },
        horizonColor: { value: new THREE.Color(0x201642) },
        topColor: { value: new THREE.Color(0x070a18) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 bottomColor;
        uniform vec3 horizonColor;
        uniform vec3 topColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float horizon = 1.0 - smoothstep(0.0, 0.65, abs(h));
          float upper = smoothstep(-0.15, 0.8, h);
          vec3 vertical = mix(bottomColor, topColor, upper);
          vec3 color = mix(vertical, horizonColor, horizon * 0.72);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.atmosphereGroup.add(new THREE.Mesh(skyGeometry, skyMaterial));

    const starCount = this.quality === "low" ? 380 : 760;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const seed = hashString(`star-${index}`);
      const direction = seededUnitVector(seed);
      const radius = 35 + unitFromHash(seed ^ 0x5a5a5a5a) * 30;
      starPositions[index * 3] = direction.x * radius;
      starPositions[index * 3 + 1] = Math.abs(direction.y * radius) + 3;
      starPositions[index * 3 + 2] = direction.z * radius;
      const warmth = unitFromHash(seed ^ 0xa11ce);
      starColors[index * 3] = 0.65 + warmth * 0.35;
      starColors[index * 3 + 1] = 0.72 + warmth * 0.24;
      starColors[index * 3 + 2] = 1;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.quality === "low" ? 0.085 : 0.105,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
      vertexColors: true,
      depthWrite: false,
      toneMapped: false,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    stars.name = "Stars";
    this.atmosphereGroup.add(stars);

    const moonMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe9bd,
      toneMapped: false,
      fog: false,
    });
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 3), moonMaterial);
    moon.position.set(-18, 17, -27);
    this.atmosphereGroup.add(moon);

    const moteCount = this.quality === "low" ? 70 : 150;
    const motePositions = new Float32Array(moteCount * 3);
    for (let index = 0; index < moteCount; index += 1) {
      const seed = hashString(`mote-${index}`);
      const angle = unitFromHash(seed) * TAU;
      const radius = 4 + unitFromHash(seed ^ 0x9423) * 12;
      motePositions[index * 3] = Math.cos(angle) * radius;
      motePositions[index * 3 + 1] = -2 + unitFromHash(seed ^ 0x19fa) * 11;
      motePositions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
    const moteMaterial = new THREE.PointsMaterial({
      color: 0xa9e8ff,
      size: 0.06,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      toneMapped: false,
    });
    const motes = new THREE.Points(moteGeometry, moteMaterial);
    motes.name = "Memory motes";
    this.atmosphereGroup.add(motes);
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9aaeff, 0x20152d, 1.5));

    const key = new THREE.DirectionalLight(0xc8d5ff, 2.35);
    key.position.set(-8, 18, 12);
    key.castShadow = this.quality === "high";
    if (key.castShadow) {
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -13;
      key.shadow.camera.right = 13;
      key.shadow.camera.top = 13;
      key.shadow.camera.bottom = -13;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 45;
      key.shadow.bias = -0.0008;
    }
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xff8fc8, 1.2);
    rim.position.set(11, 8, -15);
    this.scene.add(rim);

    const coreLight = new THREE.PointLight(0x65dfff, 4.2, 17, 2);
    coreLight.position.set(0, 2.2, 0);
    this.cityGroup.add(coreLight);
  }

  private buildIsland(): void {
    const topMaterial = new THREE.MeshStandardMaterial({
      color: 0x17243b,
      emissive: 0x081221,
      roughness: 0.78,
      metalness: 0.12,
    });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, 10.35, 0.55, 64), topMaterial);
    top.position.y = -0.12;
    top.receiveShadow = true;
    top.name = "City plateau";
    this.cityGroup.add(top);

    const undersideGeometry = createIslandUndersideGeometry(64);
    const undersideMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1830,
      emissive: 0x070817,
      roughness: 0.9,
      metalness: 0.08,
      flatShading: true,
    });
    const underside = new THREE.Mesh(undersideGeometry, undersideMaterial);
    underside.position.y = -0.42;
    underside.castShadow = true;
    underside.name = "Floating island";
    this.cityGroup.add(underside);

    const edgeGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x6b75ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const edgeGlow = new THREE.Mesh(new THREE.RingGeometry(10.4, 10.84, 96), edgeGlowMaterial);
    edgeGlow.rotation.x = -Math.PI / 2;
    edgeGlow.position.y = 0.18;
    this.cityGroup.add(edgeGlow);

    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x27213f,
      emissive: 0x090716,
      roughness: 0.92,
      flatShading: true,
    });
    for (let index = 0; index < (this.quality === "low" ? 8 : 15); index += 1) {
      const seed = hashString(`floating-rock-${index}`);
      const angle = unitFromHash(seed) * TAU;
      const radius = 11.7 + unitFromHash(seed ^ 0x1223) * 3.8;
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.24 + unitFromHash(seed ^ 0xf33) * 0.45, 0),
        rockMaterial,
      );
      rock.position.set(
        Math.cos(angle) * radius,
        -0.8 - unitFromHash(seed ^ 0x3282) * 3.5,
        Math.sin(angle) * radius,
      );
      rock.rotation.set(unitFromHash(seed) * 2, unitFromHash(seed ^ 0x93) * 3, 0);
      rock.scale.y = 1.2 + unitFromHash(seed ^ 0x5512) * 1.8;
      this.cityGroup.add(rock);
    }
  }

  private buildDistrictMarkers(): void {
    for (const [district, style] of Object.entries(DISTRICT_STYLES) as Array<
      [District, DistrictStyle]
    >) {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const diskMaterial = new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.28, 48), ringMaterial);
      const disk = new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), diskMaterial);
      ring.rotation.x = -Math.PI / 2;
      disk.rotation.x = -Math.PI / 2;
      ring.position.set(style.center[0], 0.205, style.center[1]);
      disk.position.set(style.center[0], 0.198, style.center[1]);
      ring.name = `${district} district boundary`;
      this.cityGroup.add(disk, ring);
    }
  }

  private buildMemoryCore(): void {
    this.animatedCore.name = "Memory core";
    this.animatedCore.position.y = 0.28;

    const pedestalMaterial = new THREE.MeshStandardMaterial({
      color: 0x293550,
      emissive: 0x0b1728,
      metalness: 0.65,
      roughness: 0.28,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 0.45, 8), pedestalMaterial);
    pedestal.position.y = 0.22;
    pedestal.castShadow = true;

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xbff8ff,
      emissive: 0x45dff2,
      emissiveIntensity: 2.8,
      metalness: 0.15,
      roughness: 0.15,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.54, 2), coreMaterial);
    core.position.y = 1.14;
    core.name = "Living memory light";

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x76e8ff,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.025, 6, 64), ringMaterial);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.018, 6, 64), ringMaterial);
    ringA.position.y = 1.14;
    ringB.position.y = 1.14;
    ringA.rotation.x = Math.PI * 0.48;
    ringB.rotation.set(Math.PI * 0.2, Math.PI * 0.38, 0);
    ringA.userData.rotationSpeed = 0.18;
    ringB.userData.rotationSpeed = -0.12;

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x52dcff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.62, 7.2, 16, 1, true), beamMaterial);
    beam.position.y = 4;

    this.animatedCore.add(pedestal, core, ringA, ringB, beam);
    this.cityGroup.add(this.animatedCore);
  }

  private layoutAndBuildNodes(previousIds: Set<string>, animate: boolean): void {
    const occupiedByDistrict = new Map<District, Set<number>>();
    for (const district of Object.keys(DISTRICT_STYLES) as District[]) {
      occupiedByDistrict.set(district, new Set());
    }
    const slots = createDistrictSlots();

    const orderedNodes = [...this.data.nodes].sort((left, right) => left.id.localeCompare(right.id));
    for (const node of orderedNodes) {
      const occupied = occupiedByDistrict.get(node.district);
      if (!occupied) {
        continue;
      }
      const seed = hashString(node.id);
      let slotIndex = seed % slots.length;
      const step = ((seed >>> 16) % (slots.length - 1)) + 1;
      let attempts = 0;
      while (occupied.has(slotIndex) && attempts < slots.length) {
        slotIndex = (slotIndex + step) % slots.length;
        attempts += 1;
      }
      if (occupied.has(slotIndex)) {
        slotIndex = slots.length + occupied.size;
      }
      occupied.add(slotIndex);

      const style = DISTRICT_STYLES[node.district];
      const offset = slots[slotIndex] ?? overflowSlot(slotIndex);
      const jitter = 0.12;
      const x =
        style.center[0] +
        offset.x +
        (unitFromHash(seed ^ 0x41c6ce57) - 0.5) * jitter;
      const z =
        style.center[1] +
        offset.y +
        (unitFromHash(seed ^ 0x9e3779b9) - 0.5) * jitter;

      const degree = this.data.edges.reduce(
        (count, edge) => count + Number(edge.source === node.id || edge.target === node.id),
        0,
      );
      const height = Math.min(6.2, 1.45 + node.depth * 0.68 + Math.min(degree, 8) * 0.14);
      const group = this.createBuilding(node, height, seed);
      group.position.set(x, 0.19, z);
      group.rotation.y = (unitFromHash(seed ^ 0x51f15e) - 0.5) * 0.18;
      this.buildingsGroup.add(group);

      const record = group.userData.record as BuildingRecord;
      this.buildings.set(node.id, record);

      const shouldRise =
        animate && this.motionEnabled && (!previousIds.has(node.id) || !this.initialDataApplied);
      if (shouldRise) {
        group.scale.y = 0.015;
        this.riseAnimations.push({
          group,
          startedAt: performance.now() + (seed % 360),
          duration: 780 + (seed % 360),
        });
      }
    }
  }

  private createBuilding(node: CityNode, height: number, seed: number): THREE.Group {
    const group = new THREE.Group();
    group.name = node.label;
    group.userData.nodeId = node.id;

    const width = 0.72 + unitFromHash(seed ^ 0x1020304) * 0.34;
    const depth = 0.72 + unitFromHash(seed ^ 0x9988776) * 0.3;
    switch (node.district) {
      case "concepts":
        this.addConceptTower(group, node.id, width, depth, height, seed);
        break;
      case "skills":
        this.addSkillWorkshop(group, node.id, width, depth, height, seed);
        break;
      case "evidence":
        this.addEvidenceHall(group, node.id, width, depth, height, seed);
        break;
      case "questions":
        this.addQuestionSite(group, node.id, width, depth, height, seed);
        break;
    }

    const color = DISTRICT_STYLES[node.district].color;
    const haloMaterial = this.trackTransientMaterial(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const haloGeometry = this.trackTransientGeometry(new THREE.RingGeometry(0.68, 0.86, 40));
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    halo.visible = false;

    const beamMaterial = this.trackTransientMaterial(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const beamGeometry = this.trackTransientGeometry(
      new THREE.CylinderGeometry(0.03, 0.48, Math.max(4.6, height + 2), 12, 1, true),
    );
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.y = Math.max(4.6, height + 2) / 2;
    beam.visible = false;
    group.add(halo, beam);

    const record: BuildingRecord = { node, group, halo, beam, height };
    group.userData.record = record;
    return group;
  }

  private addConceptTower(
    group: THREE.Group,
    nodeId: string,
    width: number,
    depth: number,
    height: number,
    seed: number,
  ): void {
    const body = this.makeBox(nodeId, width, height, depth, this.districtMaterials.concepts);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const crownMaterial = this.trackTransientMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xc7b8ff,
        emissive: 0x4a2b8a,
        emissiveIntensity: 1.1,
        metalness: 0.68,
        roughness: 0.22,
      }),
    );
    const crown = new THREE.Mesh(this.unitCylinder, crownMaterial);
    crown.scale.set(width * 0.66, 0.28, depth * 0.66);
    crown.position.y = height + 0.14;
    crown.userData.nodeId = nodeId;
    group.add(crown);
    this.hitTargets.push(crown);

    const spireMaterial = this.trackTransientMaterial(
      new THREE.MeshBasicMaterial({ color: 0xd8caff, toneMapped: false }),
    );
    const spire = new THREE.Mesh(this.unitCylinder, spireMaterial);
    spire.scale.set(0.035, 0.52 + unitFromHash(seed ^ 0x782) * 0.38, 0.035);
    spire.position.y = height + 0.58;
    spire.userData.nodeId = nodeId;
    group.add(spire);
    this.hitTargets.push(spire);

    this.addWindows(group, nodeId, width, depth, height, seed, 2);
  }

  private addSkillWorkshop(
    group: THREE.Group,
    nodeId: string,
    width: number,
    depth: number,
    height: number,
    seed: number,
  ): void {
    const lowerHeight = Math.max(1.1, height * 0.56);
    const base = this.makeBox(
      nodeId,
      width * 1.18,
      lowerHeight,
      depth * 1.12,
      this.districtMaterials.skills,
    );
    base.position.y = lowerHeight / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const rear = this.makeBox(
      nodeId,
      width * 0.72,
      height,
      depth * 0.7,
      this.districtMaterials.skills,
    );
    rear.position.set(0.08, height / 2, -depth * 0.12);
    rear.castShadow = true;
    group.add(rear);

    const capMaterial = this.trackTransientMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xa2fff0,
        emissive: 0x17695d,
        emissiveIntensity: 1.15,
        metalness: 0.45,
        roughness: 0.3,
      }),
    );
    const cap = new THREE.Mesh(this.unitCylinder, capMaterial);
    cap.scale.set(width * 0.45, 0.15, depth * 0.45);
    cap.position.set(0.08, height + 0.08, -depth * 0.12);
    cap.userData.nodeId = nodeId;
    group.add(cap);
    this.hitTargets.push(cap);

    if ((seed & 1) === 0) {
      const chimney = this.makeBox(nodeId, 0.14, height * 0.38, 0.14, capMaterial);
      chimney.position.set(width * 0.43, lowerHeight + height * 0.14, depth * 0.28);
      group.add(chimney);
    }
    this.addWindows(group, nodeId, width * 0.7, depth * 0.68, height, seed, 1);
  }

  private addEvidenceHall(
    group: THREE.Group,
    nodeId: string,
    width: number,
    depth: number,
    height: number,
    seed: number,
  ): void {
    const body = new THREE.Mesh(this.unitCylinder, this.districtMaterials.evidence);
    body.scale.set(width * 0.68, height, depth * 0.68);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.nodeId = nodeId;
    group.add(body);
    this.hitTargets.push(body);

    const plinthMaterial = this.trackTransientMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffd894,
        emissive: 0x54320a,
        emissiveIntensity: 0.75,
        metalness: 0.28,
        roughness: 0.42,
      }),
    );
    const plinth = new THREE.Mesh(this.unitCylinder, plinthMaterial);
    plinth.scale.set(width * 0.9, 0.24, depth * 0.9);
    plinth.position.y = 0.12;
    plinth.userData.nodeId = nodeId;
    group.add(plinth);
    this.hitTargets.push(plinth);

    const dome = new THREE.Mesh(
      this.trackTransientGeometry(
        new THREE.SphereGeometry(width * 0.52, 16, 8, 0, TAU, 0, Math.PI / 2),
      ),
      plinthMaterial,
    );
    dome.scale.z = depth / width;
    dome.position.y = height;
    dome.userData.nodeId = nodeId;
    group.add(dome);
    this.hitTargets.push(dome);

    this.addWindows(group, nodeId, width * 0.88, depth * 0.88, height, seed, 2);
  }

  private addQuestionSite(
    group: THREE.Group,
    nodeId: string,
    width: number,
    depth: number,
    height: number,
    seed: number,
  ): void {
    const ghostMaterial = this.trackTransientMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xff8ea0,
        emissive: 0x5b1424,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.15,
        metalness: 0.2,
        roughness: 0.52,
        wireframe: true,
      }),
    );
    const ghost = this.makeBox(nodeId, width, height, depth, ghostMaterial);
    ghost.position.y = height / 2;
    group.add(ghost);

    const frameMaterial = this.trackTransientMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xff8095,
        emissive: 0x4e0e1e,
        emissiveIntensity: 1.35,
        metalness: 0.62,
        roughness: 0.28,
      }),
    );
    const beamWidth = 0.07;
    const cornerPositions: Array<readonly [number, number]> = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [-width / 2, depth / 2],
      [width / 2, depth / 2],
    ];
    for (const [x, z] of cornerPositions) {
      const upright = this.makeBox(nodeId, beamWidth, height, beamWidth, frameMaterial);
      upright.position.set(x, height / 2, z);
      group.add(upright);
    }
    const floors = Math.max(2, Math.min(5, Math.round(height / 1.15)));
    for (let floor = 1; floor <= floors; floor += 1) {
      const y = (floor / floors) * height;
      const crossX = this.makeBox(nodeId, width + beamWidth, beamWidth, beamWidth, frameMaterial);
      const crossZ = this.makeBox(nodeId, beamWidth, beamWidth, depth + beamWidth, frameMaterial);
      crossX.position.set(0, y, -depth / 2);
      crossZ.position.set(width / 2, y, 0);
      group.add(crossX, crossZ);
    }

    const craneMastHeight = Math.min(4.5, height + 1.2);
    const mast = this.makeBox(nodeId, 0.08, craneMastHeight, 0.08, frameMaterial);
    mast.position.set(width * 0.72, craneMastHeight / 2, 0);
    const arm = this.makeBox(nodeId, width * 1.65, 0.07, 0.07, frameMaterial);
    arm.position.set(width * 0.1, craneMastHeight, 0);
    arm.rotation.y = (unitFromHash(seed ^ 0x8080) - 0.5) * 0.7;
    group.add(mast, arm);
  }

  private addWindows(
    group: THREE.Group,
    nodeId: string,
    width: number,
    depth: number,
    height: number,
    seed: number,
    columns: number,
  ): void {
    const rows = Math.max(1, Math.min(this.quality === "low" ? 3 : 5, Math.floor(height / 0.82)));
    for (let row = 0; row < rows; row += 1) {
      const y = 0.55 + row * Math.max(0.52, (height - 0.8) / Math.max(rows - 1, 1));
      for (let column = 0; column < columns; column += 1) {
        if (((seed >>> ((row + column) % 16)) & 3) === 0) {
          continue;
        }
        const spread = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * width * 0.5;
        const front = new THREE.Mesh(this.windowGeometry, this.windowMaterial);
        front.scale.set(1.05, 0.72, 1);
        front.position.set(spread, y, depth / 2 + 0.014);
        front.userData.nodeId = nodeId;
        group.add(front);

        const side = new THREE.Mesh(this.windowGeometry, this.windowMaterial);
        side.scale.set(1.05, 0.72, 1);
        side.rotation.y = Math.PI / 2;
        side.position.set(width / 2 + 0.014, y, spread * (depth / Math.max(width, 0.01)));
        side.userData.nodeId = nodeId;
        group.add(side);
      }
    }
  }

  private makeBox(
    nodeId: string,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
  ): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
    const mesh = new THREE.Mesh(this.unitBox, material);
    mesh.scale.set(width, height, depth);
    mesh.userData.nodeId = nodeId;
    this.hitTargets.push(mesh);
    return mesh;
  }

  private buildRoads(): void {
    for (const edge of this.data.edges) {
      const source = this.buildings.get(edge.source);
      const target = this.buildings.get(edge.target);
      if (!source || !target) {
        continue;
      }
      const start = source.group.position.clone();
      const end = target.group.position.clone();
      start.y = 0.27;
      end.y = 0.27;
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const direction = end.clone().sub(start);
      const distance = Math.max(0.01, direction.length());
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
      const bendSign = (hashString(edge.id) & 1) === 0 ? 1 : -1;
      const crossesDistrict = source.node.district !== target.node.district;
      midpoint.addScaledVector(perpendicular, Math.min(0.75, distance * 0.09) * bendSign);
      midpoint.y = crossesDistrict ? 0.55 + Math.min(1.45, distance * 0.1) : 0.29;

      const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
      const geometry = this.trackTransientGeometry(
        new THREE.TubeGeometry(
          curve,
          this.quality === "low" ? 10 : 18,
          crossesDistrict ? 0.048 : 0.055,
          5,
          false,
        ),
      );
      const material = this.trackTransientMaterial(
        new THREE.MeshBasicMaterial({
          color: EDGE_COLORS[edge.kind],
          transparent: true,
          opacity: crossesDistrict ? 0.72 : 0.48,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      const road = new THREE.Mesh(geometry, material);
      road.name = edge.relationship;
      road.userData.sourceId = edge.source;
      road.userData.targetId = edge.target;
      road.renderOrder = 2;
      this.roadsGroup.add(road);

      if (crossesDistrict && this.quality === "high") {
        const deckGeometry = this.trackTransientGeometry(
          new THREE.TubeGeometry(curve, 16, 0.085, 5, false),
        );
        const deckMaterial = this.trackTransientMaterial(
          new THREE.MeshStandardMaterial({
            color: 0x273550,
            emissive: 0x10182b,
            metalness: 0.62,
            roughness: 0.4,
          }),
        );
        const deck = new THREE.Mesh(deckGeometry, deckMaterial);
        deck.renderOrder = 1;
        deck.userData.sourceId = edge.source;
        deck.userData.targetId = edge.target;
        this.roadsGroup.add(deck);
      }
    }
  }

  private clearDynamicCity(): void {
    this.riseAnimations.length = 0;
    this.cameraAnimation = null;
    this.hitTargets.length = 0;
    this.buildings.clear();
    this.buildingsGroup.clear();
    this.roadsGroup.clear();
    for (const geometry of this.transientGeometries) {
      geometry.dispose();
    }
    for (const material of this.transientMaterials) {
      material.dispose();
    }
    this.transientGeometries.clear();
    this.transientMaterials.clear();
  }

  private applyDistrictFilter(): void {
    for (const record of this.buildings.values()) {
      record.group.visible =
        this.districtFilter === "all" || record.node.district === this.districtFilter;
    }
    for (const connection of this.roadsGroup.children) {
      const sourceId = connection.userData.sourceId as string | undefined;
      const targetId = connection.userData.targetId as string | undefined;
      const sourceVisible = sourceId ? this.buildings.get(sourceId)?.group.visible : false;
      const targetVisible = targetId ? this.buildings.get(targetId)?.group.visible : false;
      connection.visible = Boolean(sourceVisible && targetVisible);
    }
  }

  private beginCameraAnimation(
    destination: THREE.Vector3,
    target: THREE.Vector3,
    duration: number,
    targetZoom = this.camera.zoom,
  ): void {
    if (!this.motionEnabled) {
      this.camera.position.copy(destination);
      this.controls.target.copy(target);
      this.camera.zoom = targetZoom;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.requestRender();
      return;
    }
    this.cameraAnimation = {
      startedAt: performance.now(),
      duration,
      fromPosition: this.camera.position.clone(),
      toPosition: destination.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      fromZoom: this.camera.zoom,
      toZoom: targetZoom,
    };
    this.syncAnimationLoop();
  }

  private updateAnimations(now: number, delta: number): boolean {
    let active = false;
    for (let index = this.riseAnimations.length - 1; index >= 0; index -= 1) {
      const animation = this.riseAnimations[index];
      if (!animation) {
        continue;
      }
      const progress = (now - animation.startedAt) / animation.duration;
      if (progress < 0) {
        active = true;
        continue;
      }
      const eased = easeOutBack(Math.min(1, progress));
      animation.group.scale.y = Math.max(0.015, eased);
      if (progress >= 1) {
        animation.group.scale.y = 1;
        this.riseAnimations.splice(index, 1);
      } else {
        active = true;
      }
    }

    if (this.cameraAnimation) {
      const animation = this.cameraAnimation;
      const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
      const eased = easeInOutCubic(progress);
      this.camera.position.lerpVectors(animation.fromPosition, animation.toPosition, eased);
      this.controls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased);
      this.camera.zoom = THREE.MathUtils.lerp(animation.fromZoom, animation.toZoom, eased);
      this.camera.updateProjectionMatrix();
      if (progress >= 1) {
        this.cameraAnimation = null;
      } else {
        active = true;
      }
    }

    if (this.motionEnabled) {
      this.elapsed += Math.min(delta, 0.05);
      this.animatedCore.position.y = 0.28 + Math.sin(this.elapsed * 1.2) * 0.055;
      for (const child of this.animatedCore.children) {
        const speed = child.userData.rotationSpeed as number | undefined;
        if (speed) {
          child.rotation.y += delta * speed;
          child.rotation.z += delta * speed * 0.42;
        }
      }
      const stars = this.atmosphereGroup.getObjectByName("Stars");
      if (stars) {
        stars.rotation.y += delta * 0.0022;
      }
      const motes = this.atmosphereGroup.getObjectByName("Memory motes");
      if (motes) {
        motes.rotation.y -= delta * 0.014;
        motes.position.y = Math.sin(this.elapsed * 0.42) * 0.12;
      }
      active = true;
    }
    return active;
  }

  private finishAnimationsImmediately(): void {
    for (const animation of this.riseAnimations) {
      animation.group.scale.y = 1;
    }
    this.riseAnimations.length = 0;
    if (this.cameraAnimation) {
      this.camera.position.copy(this.cameraAnimation.toPosition);
      this.controls.target.copy(this.cameraAnimation.toTarget);
      this.camera.zoom = this.cameraAnimation.toZoom;
      this.camera.updateProjectionMatrix();
      this.cameraAnimation = null;
      this.controls.update();
    }
  }

  private updateHover(clientX: number, clientY: number): void {
    if (this.isDisposed) {
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.hitTargets, false);
    const hitId = findVisibleNodeId(intersections, this.buildings);
    if (hitId === this.hoveredNodeId) {
      return;
    }
    this.hoveredNodeId = hitId;
    this.canvas.style.cursor = hitId ? "pointer" : "grab";
    this.onHoverNode?.(hitId ? this.buildings.get(hitId)?.node ?? null : null);
  }

  private requestRender(): void {
    if (this.isDisposed) {
      return;
    }
    this.needsRender = true;
    if (this.canRender() && this.frameHandle === null) {
      this.frameHandle = requestAnimationFrame(this.renderFrame);
    }
  }

  private renderOnce(): void {
    if (!this.canRender()) {
      this.needsRender = true;
      return;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
  }

  private syncAnimationLoop(): void {
    if (this.isDisposed) {
      return;
    }
    if (!this.canRender()) {
      if (this.frameHandle !== null) {
        cancelAnimationFrame(this.frameHandle);
        this.frameHandle = null;
      }
      this.clock.stop();
      return;
    }
    if (this.frameHandle === null && this.shouldAnimate()) {
      this.clock.start();
      this.frameHandle = requestAnimationFrame(this.renderFrame);
    } else if (this.needsRender && this.frameHandle === null) {
      this.frameHandle = requestAnimationFrame(this.renderFrame);
    }
  }

  private shouldAnimate(): boolean {
    return (
      this.motionEnabled ||
      this.riseAnimations.length > 0 ||
      this.cameraAnimation !== null ||
      this.controls.enableDamping
    );
  }

  private canRender(): boolean {
    return (
      this.isIntersecting &&
      this.isDocumentVisible &&
      !this.isSuspended &&
      !this.isDisposed
    );
  }

  private renderFrame = (now: number): void => {
    this.frameHandle = null;
    if (!this.canRender()) {
      this.clock.stop();
      return;
    }
    if (!this.clock.running) {
      this.clock.start();
    }
    const delta = this.clock.getDelta();
    const animationActive = this.updateAnimations(now, delta);
    const controlsChanged = this.controls.update();
    if (this.needsRender || animationActive || controlsChanged) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
    if (this.shouldAnimate()) {
      this.frameHandle = requestAnimationFrame(this.renderFrame);
    } else {
      this.clock.stop();
    }
  };

  private handleResize = (): void => {
    if (this.isDisposed) {
      return;
    }
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (width === this.renderWidth && height === this.renderHeight) {
      return;
    }
    this.renderWidth = width;
    this.renderHeight = height;
    const aspect = width / height;
    const baseViewHeight = width < 620 ? 19 : 17;
    const viewHeight = width < 620 ? Math.max(baseViewHeight, 23 / aspect) : baseViewHeight;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.requestRender();
  };

  private handleIntersection = (entries: IntersectionObserverEntry[]): void => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    this.isIntersecting = entry.isIntersecting;
    if (entry.isIntersecting) {
      this.requestRender();
    }
    this.syncAnimationLoop();
  };

  private handleVisibilityChange = (): void => {
    this.isDocumentVisible = !document.hidden;
    if (this.isDocumentVisible) {
      this.requestRender();
    }
    this.syncAnimationLoop();
  };

  private handleReducedMotionChange = (event: MediaQueryListEvent): void => {
    if (this.manualMotionPreference) {
      return;
    }
    this.motionEnabled = !event.matches;
    this.controls.enableDamping = this.motionEnabled;
    if (!this.motionEnabled) {
      this.finishAnimationsImmediately();
    }
    this.requestRender();
    this.syncAnimationLoop();
  };

  private handleControlsChange = (): void => {
    this.needsRender = true;
    this.requestRender();
  };

  private handleControlsStart = (): void => {
    this.cameraAnimation = null;
    this.canvas.style.cursor = "grabbing";
    this.syncAnimationLoop();
  };

  private handleControlsEnd = (): void => {
    this.canvas.style.cursor = this.hoveredNodeId ? "pointer" : "grab";
    this.requestRender();
  };

  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
      return;
    }
    this.updateHover(event.clientX, event.clientY);
    this.selectNode(this.hoveredNodeId, { flyTo: this.hoveredNodeId !== null });
  };

  private handlePointerCancel = (): void => {
    this.pointerDown = null;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerDown) {
      return;
    }
    this.updateHover(event.clientX, event.clientY);
  };

  private handlePointerLeave = (): void => {
    this.pointerDown = null;
    if (this.hoveredNodeId !== null) {
      this.hoveredNodeId = null;
      this.onHoverNode?.(null);
    }
    this.canvas.style.cursor = "grab";
  };

  private createDistrictMaterial(district: District): THREE.MeshStandardMaterial {
    const style = DISTRICT_STYLES[district];
    return this.rememberMaterial(
      new THREE.MeshStandardMaterial({
        color: style.color,
        emissive: style.emissive,
        emissiveIntensity: 0.78,
        metalness: 0.54,
        roughness: 0.32,
      }),
    );
  }

  private rememberGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.sharedGeometries.push(geometry);
    return geometry;
  }

  private rememberMaterial<T extends THREE.Material>(material: T): T {
    this.sharedMaterials.push(material);
    return material;
  }

  private trackTransientGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.transientGeometries.add(geometry);
    return geometry;
  }

  private trackTransientMaterial<T extends THREE.Material>(material: T): T {
    this.transientMaterials.add(material);
    return material;
  }
}

function resolveQuality(quality: CityRenderQuality): Exclude<CityRenderQuality, "auto"> {
  if (quality !== "auto") {
    return quality;
  }
  const compactScreen = Math.min(window.innerWidth, window.innerHeight) < 720;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return compactScreen || coarsePointer ? "low" : "high";
}

function deduplicateNodes(nodes: readonly CityNode[]): CityNode[] {
  const seen = new Set<string>();
  const result: CityNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    result.push(node);
  }
  return result;
}

function findVisibleNodeId(
  intersections: readonly THREE.Intersection[],
  buildings: ReadonlyMap<string, BuildingRecord>,
): string | null {
  for (const intersection of intersections) {
    const nodeId = intersection.object.userData.nodeId as string | undefined;
    if (nodeId && buildings.get(nodeId)?.group.visible) {
      return nodeId;
    }
  }
  return null;
}

function createDistrictSlots(): THREE.Vector2[] {
  const slots: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const rings: Array<readonly [number, number]> = [
    [1.13, 7],
    [2.15, 11],
    [3.08, 15],
  ];
  for (const [radius, count] of rings) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TAU + (count % 2) * 0.17;
      slots.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
  }
  return slots;
}

function overflowSlot(index: number): THREE.Vector2 {
  const overflowIndex = Math.max(0, index - 34);
  const angle = overflowIndex * 2.399963229728653;
  const radius = 3.3 + Math.sqrt(overflowIndex + 1) * 0.36;
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function createIslandUndersideGeometry(segments: number): THREE.BufferGeometry {
  const rings: Array<readonly [number, number]> = [
    [10.35, 0],
    [9.6, -0.65],
    [7.9, -1.55],
    [5.7, -2.65],
    [3.2, -3.75],
    [0.35, -4.65],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    if (!ring) {
      continue;
    }
    const [baseRadius, y] = ring;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TAU;
      const noise =
        1 +
        Math.sin(segment * 3.1 + ringIndex * 1.7) * 0.035 +
        Math.sin(segment * 7.3 - ringIndex * 0.9) * 0.018;
      positions.push(Math.cos(angle) * baseRadius * noise, y, Math.sin(angle) * baseRadius * noise);
    }
  }
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const nextSegment = (segment + 1) % segments;
      const a = ringIndex * segments + segment;
      const b = ringIndex * segments + nextSegment;
      const c = (ringIndex + 1) * segments + nextSegment;
      const d = (ringIndex + 1) * segments + segment;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unitFromHash(hash: number): number {
  let value = hash >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function seededUnitVector(seed: number): THREE.Vector3 {
  const y = unitFromHash(seed ^ 0x83d2e9) * 2 - 1;
  const angle = unitFromHash(seed ^ 0x2bc541) * TAU;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function easeOutBack(value: number): number {
  const overshoot = 1.70158;
  const adjusted = value - 1;
  return 1 + (overshoot + 1) * adjusted ** 3 + overshoot * adjusted ** 2;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}
