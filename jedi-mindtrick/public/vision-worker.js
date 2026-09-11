/* Classic worker: MediaPipe's WASM loader uses importScripts. Frames never leave this worker/browser. */
importScripts('/vision_bundle.js');
let hands, segmenter;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await Vision.FilesetResolver.forVisionTasks('/wasm');
      hands = await Vision.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/models/hands.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .6, minTrackingConfidence: .6 });
      segmenter = await Vision.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: '/models/selfie.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
      self.postMessage({ type: 'ready' });
    } catch { self.postMessage({ type: 'error', message: 'Vision models could not start. Check the connection, then try again.' }); }
    return;
  }
  if (data.type !== 'frame' || !data.bitmap) return;
  const start = performance.now();
  try {
    const detected = hands.detectForVideo(data.bitmap, data.timestamp);
    const result = { type: 'frame', id: data.id, timestamp: data.timestamp, hands: detected.landmarks.map((landmarks, i) => ({ landmarks, score: detected.handedness[i]?.[0]?.score ?? 0, handedness: detected.handedness[i]?.[0]?.categoryName ?? '' })), inferenceMs: 0 };
    if (data.segment) {
      segmenter.segmentForVideo(data.bitmap, data.timestamp, output => {
        // Selfie model: person channel is 1 when both categories are emitted; older single-output models emit person confidence directly.
        const person = output.confidenceMasks[1] ?? output.confidenceMasks[0];
        result.mask = person.getAsFloat32Array().slice(); result.maskWidth = person.width; result.maskHeight = person.height;
      });
    }
    result.inferenceMs = performance.now() - start;
    self.postMessage(result, result.mask ? [result.mask.buffer] : []);
  } catch { self.postMessage({ type: 'error', message: 'Tracking stopped. Your camera has been released; restart to recover.' }); }
  finally { data.bitmap.close(); }
};
