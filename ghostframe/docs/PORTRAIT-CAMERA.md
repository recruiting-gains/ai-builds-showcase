# Portrait camera

Keep your phone upright and use **Start your camera** and **Record** directly in the normal page. Fullscreen and turning the phone sideways are optional. The inline preview shows the complete image at its camera proportions, capped to 66% of the viewport height so a portrait preview does not become an oversized page. The page scrolls normally to the recorder and design tools.

Invisible, HandFrame and Cube now all use the actual video dimensions. The longest canvas edge is 768 pixels: a 9:16 source becomes 432 × 768; a 16:9 source becomes 768 × 432. Other source proportions are retained. Front camera pixels and landmarks are mirrored once; rear camera pixels and landmarks remain unmirrored. Fullscreen Fit shows the complete image; Fill intentionally crops its display to cover the screen. Neither changes the recorded camera proportions.

The previous HandFrame and Invisible compositor drew every camera into a fixed 768 × 432 canvas. A portrait source was therefore squeezed before either display or recording. Changing only CSS could not repair those pixels. The compositor now resizes its camera, scene and background buffers together. HandFrame perspective and local-photo roll also receive the current aspect ratio.

If the camera orientation changes during a recording, the last composed frame is held until the current clip finishes at its original dimensions. The next take uses the new orientation. Save or discard the retained clip before recording again. An Invisible room capture and its countdown are cleared on orientation changes; capture the empty room again before disappearing. Previous masks, texture caches and delayed tracking results cannot carry the old orientation into the new image. Local photo slots remain available.

## Checks and limits

`npm run test:camera` uses a generated camera containing circles, squares and colored edge markers, synthetic tracking results and the actual browser compositor and recorder. It checks camera proportions in normal/fullscreen layouts and downloaded video, both camera directions, orientation changes, mode switches and cleanup. `npm run test:phone`, `npm run test:panel` and `npm run test:cube` retain separate regression checks for photos, tracking, the four-corner panel and Cube.

Browser reports and generated demonstration clips stay in ignored `test-results/`. User screenshots and recordings are private evidence and are not included in source. No new media upload or provider request is introduced. These checks establish browser behavior with synthetic inputs; physical iPhone acceptance and native Photos saving remain pending until directly observed.
