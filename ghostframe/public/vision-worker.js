/* Classic worker: MediaPipe's WASM loader uses importScripts. Frames never leave this worker/browser. */
importScripts('/vision_bundle.js');
let hands, segmenter, files, handBackend = 'CPU', lastMaskAt = -Infinity;
async function createHands(delegate) {
  const options = { baseOptions: { modelAssetPath: '/models/hands.task', delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minHandPresenceConfidence: .5, minTrackingConfidence: .5 };
  if (delegate === 'GPU') options.canvas = new OffscreenCanvas(512, 288);
  return Vision.HandLandmarker.createFromOptions(files, options);
}
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      files = await Vision.FilesetResolver.forVisionTasks('/wasm');
      if (typeof OffscreenCanvas !== 'undefined') {
        try { hands = await createHands('GPU'); handBackend = 'GPU'; }
        catch { hands = await createHands('CPU'); }
      } else hands = await createHands('CPU');
      segmenter = await Vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: '/models/selfie.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
      self.postMessage({ type: 'ready' });
    } catch { self.postMessage({ type: 'error', message: 'Vision models could not start. Check the connection, then try again.' }); }
    return;
  }
  if (data.type !== 'frame' || !data.bitmap) return;
  const start = performance.now();
  try {
    let detected;
    try { detected = hands.detectForVideo(data.bitmap, data.timestamp); }
    catch (error) {
      if (handBackend !== 'GPU') throw error;
      // One concrete recovery for an unavailable/lost GPU. No retry loop.
      try { hands.close(); } catch {}
      hands = await createHands('CPU'); handBackend = 'CPU';
      detected = hands.detectForVideo(data.bitmap, data.timestamp);
    }
    const result = { type: 'frame', id: data.id, timestamp: data.timestamp, hands: detected.landmarks.map((landmarks, i) => ({ landmarks, score: detected.handedness[i]?.[0]?.score ?? 0, handedness: detected.handedness[i]?.[0]?.categoryName ?? '' })), inferenceMs: 0, handBackend };
    // Keep hands responsive while the heavier person mask runs at up to 20 Hz.
    if (data.segment && data.timestamp - lastMaskAt >= 50) {
      segmenter.segmentForVideo(data.bitmap, data.timestamp, output => {
        // Selfie model: person channel is 1 when both categories are emitted; older single-output models emit person confidence directly.
        const person = output.confidenceMasks[1] ?? output.confidenceMasks[0];
        result.mask = person.getAsFloat32Array().slice(); result.maskWidth = person.width; result.maskHeight = person.height;
      });
      lastMaskAt = data.timestamp;
    }
    if (!data.segment) lastMaskAt = -Infinity;
    result.inferenceMs = performance.now() - start;
    self.postMessage(result, result.mask ? [result.mask.buffer] : []);
  } catch { self.postMessage({ type: 'error', message: 'Tracking stopped. Your camera has been released; restart to recover.' }); }
  finally { data.bitmap.close(); }
};
