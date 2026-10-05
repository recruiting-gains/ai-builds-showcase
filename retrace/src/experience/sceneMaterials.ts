import * as THREE from "three";

// Small deterministic, locally authored surface maps. No external textures or HDRIs.
type Surface = "timber" | "stone" | "fabric" | "roof";
export function createSurfaceLibrary(renderer: THREE.WebGLRenderer) {
  const textures: THREE.Texture[] = [];
  const maps = new Map<Surface, THREE.DataTexture>();
  const noise = (x: number, y: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  function map(kind: Surface) {
    if (maps.has(kind)) return maps.get(kind)!;
    const size = 256, bytes = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = noise(x, y), u = x / size, v = y / size;
      let value = .88 + (n - .5) * .12;
      if (kind === "timber") {
        const grain = Math.sin(u * 590 + Math.sin(v * 8.2) * 2.6 + Math.sin(v * 26) * .55);
        const pores = Math.pow(Math.max(0, grain), 12);
        value = .93 - pores * .17 + (n - .5) * .045 + Math.sin(u * 53) * .035;
      } else if (kind === "stone") {
        value = .90 + (n - .5) * .08 + Math.sin(u * 17 + Math.sin(v * 23)) * .025;
      } else if (kind === "fabric") {
        value = .93 - (x % 3 === 0 ? .09 : 0) - (y % 3 === 0 ? .055 : 0) + (n - .5) * .035;
      } else {
        value = .87 + (n - .5) * .11 + Math.sin(u * 8) * Math.cos(v * 13) * .035;
      }
      const i = (y * size + x) * 4, channel = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      bytes[i] = bytes[i + 1] = bytes[i + 2] = channel; bytes[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    maps.set(kind, texture); textures.push(texture);
    return texture;
  }
  function apply(mesh: THREE.Mesh) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material.isMeshStandardMaterial) return;
    const name = material.name;
    let kind: Surface | undefined;
    if (/oak|cedar/.test(name)) kind = "timber";
    else if (/plaster|limestone|stone|ceramic/.test(name)) kind = "stone";
    else if (/linen|upholstery|cushion|rug/.test(name)) kind = "fabric";
    else if (/membrane/.test(name)) kind = "roof";
    if (kind) {
      // The compact GLB is merged by material. Project metre-scale UVs per face.
      const geometry = mesh.geometry, p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        const horizontal = ny >= nx && ny >= nz;
        uv[i * 2] = horizontal ? p.getX(i) : nx > nz ? p.getZ(i) : p.getX(i);
        uv[i * 2 + 1] = horizontal ? p.getZ(i) : p.getY(i);
        const scale = kind === "fabric" ? 3 : kind === "timber" ? .8 : .65;
        uv[i * 2] *= scale; uv[i * 2 + 1] *= scale;
      }
      geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      material.map = map(kind);
      material.bumpMap = map(kind);
      material.bumpScale = kind === "stone" ? .012 : kind === "timber" ? .004 : .006;
      material.roughness = kind === "fabric" ? .98 : kind === "timber" ? .64 : kind === "roof" ? .83 : .82;
    }
    if (/powdercoat|steel/.test(name)) { material.roughness = .38; material.metalness = .65; }
    if (/glass/.test(name)) { material.opacity = .23; material.roughness = .14; material.metalness = .35; }
    if (/cedar_honey/.test(name)) material.color.setHex(0x805737);
    if (/cedar_light/.test(name)) material.color.setHex(0x98734e);
    if (/cedar_dark/.test(name)) material.color.setHex(0x514130);
    if (/mineral_plaster/.test(name)) material.color.setHex(0xaeb0a9);
    if (/warm_luminous/.test(name)) material.emissiveIntensity = 2.4;
    material.needsUpdate = true;
  }
  return { apply, dispose: () => textures.forEach(texture => texture.dispose()) };
}
