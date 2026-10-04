# ReTrace tour

- [Landscape, 1920×1080](https://retrace.recruiting-gains.workers.dev/media/ReTrace-landscape.mp4)
- [Portrait, 1080×1920](https://retrace.recruiting-gains.workers.dev/media/ReTrace-portrait.mp4)

Both exports contain 900 frames at 30 fps: 30 seconds of H.264 video with AAC stereo audio. Actual application recordings demonstrate playback, scrubbing, simulated data labels, and the private sensor connection interface. The animated room is illustrative. No physical sensing claim is made.

Astra directed the production; Blender 5.2.1 created the original animated room and assembled both edits; Runway generated the atmosphere used in the timeline, narration, and instrumental soundtrack. The production used 73 existing Runway credits. Editable Blender timelines and the original room are preserved in a separate local source package with relative media references and packed fonts.

Both MP4s fully decode without reported video or audio errors. The Blender timelines reopened with all 310 relative media references resolved. Independent visual review checked captions, cuts, orientation, padding, and the final URL. Audio measures −16.9 LUFS integrated and −4.2 dBFS true peak. Direct listening and physical-phone playback were not verified. There is an intentional visual cut into the final hold at 28 seconds.

## Release assets

Videos are served as Cloudflare static assets and excluded from Git to keep source history small. `public/media/manifest.json` records exact sizes and SHA-256 hashes. Before building a deployment from a fresh clone:

```sh
npm run media:fetch
npm run build
npm run deploy
```

The download script verifies both files before writing them. The app's normal build and tests do not require downloading the videos. Deployment remains an explicit operation.
