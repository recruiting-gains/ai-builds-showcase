import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { DetectedHand } from './gestures';

type Incoming = { type: 'init'; origin: string } | { type: 'frame'; bitmap: ImageBitmap; time: number };
const scope = self as unknown as DedicatedWorkerGlobalScope;
let model: HandLandmarker | undefined;
let delegate: 'GPU' | 'CPU' = 'GPU';
let files: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let modelPath = '';
let initialization = 0;

async function create(delegateChoice: 'GPU' | 'CPU') {
  // MediaPipe consumes its module factory on initialization. A fresh same-origin
  // loader URL permits ES-module re-evaluation for CPU recovery, while preserving
  // the exact original loader bytes and cached WASM binary/model assets.
  const loader = new URL(files.wasmLoaderPath);
  loader.searchParams.set('initialization', String(++initialization));
  return HandLandmarker.createFromOptions({ ...files, wasmLoaderPath: loader.href }, {
    baseOptions: { modelAssetPath: modelPath, delegate: delegateChoice },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.65, minHandPresenceConfidence: 0.65, minTrackingConfidence: 0.6,
  });
}

scope.onmessage = async ({ data }: MessageEvent<Incoming>) => {
  if (data.type === 'init') {
    try {
      // Model and WASM are same-origin build assets; frames never leave the worker.
      const origin = new URL(data.origin).origin;
      if (origin !== scope.location.origin) throw new Error('Model origin must match the app.');
      files = await FilesetResolver.forVisionTasks(`${origin}/vision`, true);
      modelPath = `${origin}/models/hand_landmarker.task`;
      try { model = await create('GPU'); }
      catch { delegate = 'CPU'; model = await create('CPU'); }
      scope.postMessage({ type: 'ready', delegate });
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Tracking model could not load.' });
    }
    return;
  }
  const started = performance.now();
  try {
    if (!model) throw new Error('Tracking model is not ready.');
    let result;
    try { result = model.detectForVideo(data.bitmap, data.time); }
    catch (error) {
      if (delegate === 'CPU') throw error;
      model.close(); model = undefined; delegate = 'CPU'; model = await create('CPU');
      result = model.detectForVideo(data.bitmap, data.time);
    }
    const hands: DetectedHand[] = result.landmarks.map((landmarks, i) => ({
      landmarks, handedness: result.handedness[i]?.[0]?.categoryName ?? 'Unknown',
      confidence: result.handedness[i]?.[0]?.score ?? 0,
    }));
    scope.postMessage({ type: 'result', hands, time: data.time, width: data.bitmap.width, height: data.bitmap.height,
      latencyMs: performance.now() - started, delegate });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Hand tracking stopped.' });
  } finally {
    data.bitmap.close();
  }
};
