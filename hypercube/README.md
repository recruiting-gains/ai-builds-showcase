# HYPERCUBE — Fourth Dimension Lab

**[Open the public experience ↗](https://cruz-hypercube.cg-stackd.chatgpt.site/)** · [Back to the showcase](../README.md#live-builds)

[![HYPERCUBE’s actual browser-rendered tesseract, with luminous edges and transparent faces.](../docs/assets/showcase/hypercube.png)](https://cruz-hypercube.cg-stackd.chatgpt.site/)

*A still captured from the live demo in cinematic view.*

HYPERCUBE is an interactive geometry lab that makes an abstract idea easier to explore: what would a four-dimensional cube look like when projected onto a screen?

Switch between a square, cube, and tesseract. Watch each shape extend into another dimension, rotate the geometry, and see how its appearance changes. Glowing edges, transparent faces, and optional light trails make the structure easier to follow.

## Try it

1. Press **Dimension Shift** to watch a square extend into a cube, then a tesseract.
2. Drag to change your viewing angle; scroll or pinch to zoom.
3. Open the six rotation controls to change the geometry itself, including rotations through the fourth dimension.
4. Compare perspective and orthographic projections, or pause the rotation and inspect one view.
5. Enter **Cinematic view** to hide the surrounding controls. Use the Exit button or **Esc** to return.

The optional explanation panel introduces the geometry without requiring a mathematics background. Keyboard camera controls and a reduced-motion setting are supported.

## What the fourth dimension means here

A square has two independent directions, a cube has three, and a tesseract has four. The fourth spatial direction is called **W**; it is not time.

The application rotates four-dimensional coordinates and projects them into a three-dimensional scene, which your screen displays in two dimensions. Dragging the camera changes your view of that scene; the rotation controls change the underlying geometry. They are different operations.

A tesseract has **16 vertices, 32 edges, 24 square faces, and 8 cubic cells**. Its projected edges can cross or overlap without creating new connections. Light trails are decorative, not data or neural activity. Dimension Shift is an extension into a new direction, not an unfolding or cross-section.

## What I developed

I used AI-assisted development to customize the interface, build the luminous Three.js rendering system, add the dimensional sequence and cinematic controls, and write learning explanations and automated checks.

The running experience uses geometry and browser graphics—not an AI model. No AI API key or paid AI service is needed to explore it. It does not connect to personal notes, messages, or accounts.

## Attribution and verification

This is a customized derivative of **[Tarek Sherif’s Tesseract Explorer](https://github.com/tsherif/tesseract-explorer)**. Its original four-dimensional rotation functions are reused, and its MIT attribution is retained. I am not claiming authorship of the original project or its mathematics.

Nineteen automated tests passed, covering shape structure, rotations, projection calculations, dimensional-extension endpoints, and the optional agent-control adapter. The production build and independent source reviews also passed. These checks are not a measured frame-rate benchmark or a claim of exhaustive browser testing; graphics performance depends on the device and browser. WebGL2 support is required.

The live demo and this overview are public. The customized source repository remains private.
