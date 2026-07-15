import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = '/models';

let modelsPromise: Promise<void> | null = null;

// face-api's bundled tfjs exposes setBackend/ready at runtime, but its hand-written .d.ts
// omits them from the curated export list — cast narrowly to route around the gap.
const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };

/**
 * Pins the bundled tfjs to 'webgl', falling back to 'cpu' if webgl is unavailable (locked-down
 * exam browsers, VMs, hardware acceleration disabled, etc). Never lets tfjs auto-select: left
 * alone, its default priority order tries 'wasm' first, which has no binary served by this app
 * (only MediaPipe's own wasm runtime is hosted, under /mediapipe/wasm) and fails with "highest
 * priority backend 'wasm' has not yet been initialized". Note setBackend() resolves a boolean
 * success flag rather than throwing on failure, so a silent webgl failure must be checked
 * explicitly — otherwise the following ready() falls through to that same broken auto-select.
 */
async function ensureBackend(): Promise<void> {
  const webglOk = await tf.setBackend('webgl').catch(() => false);
  if (!webglOk) {
    await tf.setBackend('cpu');
  }
  await tf.ready();
}

/** Loads the face-api.js identity models once (memoized) from same-origin /models — never a CDN. */
export function loadFaceModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = ensureBackend()
      .then(() =>
        Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]),
      )
      .then(() => undefined);
  }
  return modelsPromise;
}

// Smaller inputSize (default is 416) cuts CPU-backend inference time drastically — matters when
// webgl isn't usable and ensureBackend() has fallen back to 'cpu', where full-size detection can
// take seconds per frame. Still plenty accurate for a single, close-up, front-facing webcam face.
const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({ inputSize: 224 });

/** Full descriptor extraction — used for enrollment and identity (re-)verification. */
export async function getFaceDescriptor(video: HTMLVideoElement): Promise<Float32Array | null> {
  const result = await faceapi
    .detectSingleFace(video, DETECTOR_OPTIONS)
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

export type FrameQualityReason = 'no_face' | 'multiple_faces' | 'off_center' | 'low_light';
export interface FrameQuality {
  ok: boolean;
  reason?: FrameQualityReason;
}

export const GUIDANCE_MESSAGES: Record<FrameQualityReason, string> = {
  no_face: 'Make sure your face is visible to the camera.',
  multiple_faces: 'Make sure only you are visible.',
  off_center: 'Center your face in the frame.',
  low_light: 'Move to a better-lit area.',
};

const CENTER_TOLERANCE = 0.25; // face box center must be within 25% of frame half-dimension
const MIN_AVG_LUMA = 60; // 0-255 scale; below this is treated as too dark

let lumaCanvas: HTMLCanvasElement | null = null;

function sampleAverageLuma(video: HTMLVideoElement): number {
  if (!lumaCanvas) lumaCanvas = document.createElement('canvas');
  const size = 32; // downsample — only need a rough brightness estimate
  lumaCanvas.width = size;
  lumaCanvas.height = size;
  const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 255;
  ctx.drawImage(video, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return total / (data.length / 4);
}

/** Gates enrollment/exam-gate capture on: exactly one face, roughly centered, adequate light. */
export async function assessFrameQuality(video: HTMLVideoElement): Promise<FrameQuality> {
  const detections = await faceapi.detectAllFaces(video, DETECTOR_OPTIONS);

  if (detections.length === 0) return { ok: false, reason: 'no_face' };
  if (detections.length > 1) return { ok: false, reason: 'multiple_faces' };

  const box = detections[0].box;
  const faceCenterX = box.x + box.width / 2;
  const faceCenterY = box.y + box.height / 2;
  const dx = Math.abs(faceCenterX - video.videoWidth / 2) / video.videoWidth;
  const dy = Math.abs(faceCenterY - video.videoHeight / 2) / video.videoHeight;
  if (dx > CENTER_TOLERANCE || dy > CENTER_TOLERANCE) return { ok: false, reason: 'off_center' };

  if (sampleAverageLuma(video) < MIN_AVG_LUMA) return { ok: false, reason: 'low_light' };

  return { ok: true };
}

export interface CaptureOptions {
  samples?: number;
  intervalMs?: number;
  maxRetriesPerSample?: number;
  onGuidance?: (reason: FrameQualityReason | null) => void;
}

const DETECTION_TIMEOUT_MS = 5000;
const TIMED_OUT_QUALITY: FrameQuality = { ok: false, reason: 'no_face' };

/**
 * Bounds a single quality check to DETECTION_TIMEOUT_MS. Without this, a slow CPU-backend
 * inference (or a stalled tfjs op) leaves assessFrameQuality's promise pending indefinitely —
 * the retry loop below just awaits it forever, so the UI shows 0% progress with no guidance
 * and no error, looking identical to a hard freeze. Racing it against a timeout guarantees the
 * loop always advances to either a real guidance message or, after enough retries, a clear
 * "could not get a clear view" error instead of silent nothing.
 */
function assessFrameQualityWithTimeout(video: HTMLVideoElement): Promise<FrameQuality> {
  return Promise.race([
    assessFrameQuality(video),
    new Promise<FrameQuality>((resolve) => setTimeout(() => resolve(TIMED_OUT_QUALITY), DETECTION_TIMEOUT_MS)),
  ]);
}

/**
 * Enrollment capture: 3-5 quality-gated samples ~1s apart, averaged into one template.
 * Each sample slot retries (with guidance callback) until quality passes, rather than
 * ever capturing a bad frame.
 */
export async function captureAveragedDescriptor(
  video: HTMLVideoElement,
  { samples = 5, intervalMs = 1000, maxRetriesPerSample = 15, onGuidance }: CaptureOptions = {},
): Promise<Float32Array> {
  const collected: Float32Array[] = [];

  for (let i = 0; i < samples; i++) {
    let attempt = 0;
    for (;;) {
      const quality = await assessFrameQualityWithTimeout(video);
      if (quality.ok) {
        onGuidance?.(null);
        break;
      }
      onGuidance?.(quality.reason ?? 'no_face');
      attempt++;
      if (attempt >= maxRetriesPerSample) {
        throw new Error(`quality_gate_failed:${quality.reason}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const descriptor = await getFaceDescriptor(video);
    if (descriptor) collected.push(descriptor);

    if (i < samples - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (collected.length === 0) {
    throw new Error('no_descriptors_captured');
  }

  const length = collected[0].length;
  const averaged = new Float32Array(length);
  for (const descriptor of collected) {
    for (let i = 0; i < length; i++) averaged[i] += descriptor[i];
  }
  for (let i = 0; i < length; i++) averaged[i] /= collected.length;

  return averaged;
}
