# Foldspace verification

Checked September 10, 2026. This is an experimental browser game, with its limits stated below.

## Results

- Eleven automated tests passed: milestone guards, cyan self-loop, wrong-key collision, reciprocal-pair truth table, proximity, invalid-save normalization, recoverability, return arches, floor/fall recovery, non-bouncing traversal, and replay rejection.
- An independent traversal of the actual implementation found 70 reachable logical states and 177 legal transitions. Every nonwinning state has a path to the single terminal win state.
- The full automatic walkthrough rendered all five rooms, earned all three milestones, and reached the Home pad with zero falls, nine legal puzzle actions, no browser page errors, and a completed demo director.
- The real local API accepted the complete legal puzzle sequence with HTTP 200 and rejected an immediate forged goal action with HTTP 400. Validation explicitly checks puzzle rules only.
- TypeScript, ESLint, and the production Cloudflare-compatible build passed. The game uses a client-loaded Three.js chunk; its size warning is expected for a 3D engine and is not a failed build.
- The final Instagram MP4 contains 900 decoded frames: 30 seconds, 1080×1920, 30 fps, H.264 video and stereo AAC audio. Representative captured frames were inspected for the scene, room state, interaction captions, and earned ending.
- The development session's configured model and effort were checked before crediting GPT-6 Astra with Ultra reasoning.

## Corrections made during review

The demo now leaves its final travel step when the real goal predicate fires, so its ending completes. Short-screen controls were moved inside the viewport. Held movement clears on falling and portal transitions while remaining usable across a touch interaction. Save-repair text no longer implies unsupported progress was recovered.

## Limits

The graph check proves logical recoverability, not every possible physical input sequence. Recorded play uses the real movement and collision engine, but the automatic director supplies the inputs. It is not a human speedrun or an independent AI-control benchmark.

The capture was produced in desktop Chromium at a portrait viewport. Physical iPhone Safari, Android devices, touch ergonomics, 200% text enlargement, and a range of older GPUs have not been independently verified. WebGL is required. Browser storage is local to the device and may be unavailable or cleared.

The optional WebMCP read/start tools are feature-detected. The capture browser did not supply a supported WebMCP registry, so native WebMCP execution is not claimed as verified.

Portal destinations use a single rendering pass with a transformed camera and explicit room transitions. There is no recursive portal view or physical wormhole simulation.

## Hosting and sharing

The Site is registered at https://foldspace-by-cruz.cg-stackd.chatgpt.site/ and begins with owner-only access. Source validation is completed before publication; the hosting service's terminal deployment status is the authority for availability. Public access requires the owner's explicit audience choice. The recorded video is a prepared upload, not an Instagram post.
