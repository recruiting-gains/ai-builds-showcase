# ReTrace original architectural asset

`build_house.mjs` generates `../public/models/retrace-home.glb` using the project's existing Three.js and GLTFExporter. Run `node art/build_house.mjs` from the preview directory. No dependencies were installed and no third-party model, texture, HDRI, or generative output is included.

The scene uses metres, Y up, and a +Z front facade. The house body spans approximately x −5…5, z −3.7…3.7. Its floor surface is y 0.313. The recessed entrance is centered at x 0.815, z 3.15; its threshold is y 0.33. The right-hinged oak door opens inward approximately 42°, making the opening legible from the front-right hero camera. Keep characters outside the threshold. The stepping path extends to z 7.915; sparse side planting extends to x 5.705.

Named animation groups:

- `retrace_roof`: slab, fascia, ceiling, soffit, and recessed light lenses. Lift or hide this group for the cutaway.
- `cutaway_front`: front glazing, cedar facade, entrance, door and entry fixtures.
- `cutaway_right`: right facade and its cedar battens.
- `architecture`: foundation, floor, back/left walls and mounted art; stays present in cutaway.
- `furniture`: lounge, dining, kitchen and entry furnishings.
- `landscape`: porch, stepping slabs and small planters; no giant ground plane.

The asset contains no lights, cameras, people or text. Warm exterior emissive diffuser geometry supplies visible light-source surfaces only; interior diffuser materials are unlit for the midnight scene; the host must add lighting and shadows. The host uses an exterior-directed warm porch spotlight, a restrained lantern spill, and cool moon/rim lights, with no general interior illumination. A restrained router accent appears during the simulated reveal. A separately modelled lantern is attached to the front facade so it follows the cutaway. These are visual scene lights, not sensing data.

The current GLB is 2,239,412 bytes with 30,584 triangles and 53 material-batched draw meshes. The cloud revision replaces olive foliage blobs with individual leaves and clears space on the entry console for the router. Meshes were merged by animation group and material to keep the reveal controls independent. The GLB has no embedded textures. The host authors four small deterministic surface maps at runtime for timber, stone, cloth, and roof surfaces; no remote textures are loaded. Exact generated statistics are saved in `asset-report.json`. The roof top uses three closely related rough charcoal materials, subtle membrane courses, welded seams and dark perimeter coping; its warm/light underside stays independent in appearance. All these parts remain in `retrace_roof`.

Validation: GLB parsed with the installed Three.js GLTFLoader; required groups exist and geometry positions are finite. Browser rendering is owned by the coordinating task and is a separate visual check.

The asset is generated with the existing Three.js exporter under Node 24, not Blender. The archived Mac handoff records a previous Blender startup problem; the cloud revision does not depend on that machine or application.

`src/experience/sceneDetails.ts` separately authors the router, outdoor visitors, lantern, and illustrative presence. The physical router and all three wave shells use `ROUTER_ORIGIN = (3.22, 1.27, 2.5)`. Its body rests on the console; the emission anchor lies between its antennas. These are fictional visualizations, not measured RF propagation or a validated detector.
