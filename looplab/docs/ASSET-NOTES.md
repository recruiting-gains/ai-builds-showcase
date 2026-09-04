# LoopLab asset notes

## Original laboratory artwork

`public/looplab-lab.webp` is the web version of original artwork generated for LoopLab with the built-in OpenAI ImageGen tool. One image-generation request produced a 1672 × 941 PNG, approximately 16:9. The generated image was visually inspected and converted to WebP for use in the website and GitHub showcase.

The brief followed the showcase's miniature 3D exhibit style: a dark navy and obsidian room, two parallel mint/cyan and amber test lanes, translucent capsules, magnetic rings, and a central circular reactor. The inspected output contains no people, readable promotional text, third-party logo, or watermark.

The illustration serves as key art, social-preview artwork, and a fallback when the live 3D scene is unavailable. The interactive scene is rendered separately by the Three.js implementation in `src/client/scene.ts`. The image itself is not a screenshot of a completed experiment or evidence of model performance.

## Exact generation prompt

```text
Use case: stylized-concept.
Asset type: original 16:9 key art for the LoopLab website and GitHub showcase, clean standalone artwork, not a website mockup.
Scene/backdrop: dark navy and obsidian backdrop containing a beautifully detailed miniature isometric science-fiction prompt-testing laboratory, like an inviting premium video-game environment.
Subject: exactly two parallel laboratory test lanes, one illuminated mint/cyan and the other warm amber/orange. Translucent test capsules float along the lanes through magnetic rings toward compact, orderly result terminals. A central glowing circular reactor loop rises at the rear of the laboratory.
Style/medium: high-end cinematic 3D rendering; convincing miniature scale; finely rendered translucent glass and brushed dark metal; polished depth and crisp small details.
Composition/framing: wide 16:9 landscape composition; elevated isometric three-quarter camera; complete miniature platform and architectural room edges visible; clean silhouette and generous dark breathing room around the exhibit. The paired lanes and circular reactor must be immediately legible.
Lighting/mood: immersive cinematic yet friendly; cyan and amber glow balanced by warm tiny practical pin lights; restrained atmospheric bloom; rich shadow detail.
Constraints: no people, no characters, absolutely no text, no letters, no numbers, no logos, no watermark, no UI screenshot, no webpage frame. Any small terminal displays contain only simple abstract light shapes. Create one original, exceptionally polished illustration.
```

No CLI image-generation fallback was used. The generated raster should remain identified as generated artwork when discussed as part of the build process.

## Fonts and interface assets

The project bundles Space Grotesk and DM Sans font files under `public/fonts/` so the website can serve its typography locally. Their license notices are included alongside the fonts as `Space-Grotesk-OFL.txt` and `DM-Sans-OFL.txt`; keep those notices with redistributed copies.

The LoopLab icon and interface graphics are project assets. They do not represent OpenAI, Anthropic, Meta, Cloudflare, or another company's branding. LoopLab is an independent portfolio project with no claimed affiliation or endorsement.

Project code uses the parent repository's [MIT license](../../LICENSE). Dependency and font licenses continue to apply to their respective materials; using an AI tool to create artwork does not imply endorsement by its provider.
