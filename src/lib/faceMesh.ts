import { FaceLandmarker, FilesetResolver, type Classifications } from '@mediapipe/tasks-vision';

const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/face_landmarker.task';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/** Loads the MediaPipe FaceLandmarker once (memoized) from same-origin assets — never a CDN. */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_PATH)
      .then((fileset) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_PATH },
          runningMode: 'VIDEO',
          numFaces: 4, // detect extra faces so MULTIPLE_FACES can be flagged
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
      )
      .catch((err) => {
        // Un-cache the rejection so a caller that retries (e.g. after the network hiccup that
        // caused it) gets a fresh attempt instead of the same dead promise forever.
        landmarkerPromise = null;
        throw err;
      });
  }
  return landmarkerPromise;
}

export interface FrameDetection {
  faceCount: number;
  yawDeg: number | null;
  pitchDeg: number | null;
  blendshapes: Classifications | null;
  /** False when this call couldn't produce a real reading (video has no decoded frame yet, or
   * the detector threw). Callers should skip strike/clear bookkeeping on a not-ok frame rather
   * than treating it as a genuine zero-face read — otherwise a transient hiccup either falsely
   * accuses the candidate or, worse, silently wedges detection for the rest of the exam. */
  ok: boolean;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Decodes yaw/pitch from MediaPipe's column-major 4x4 facialTransformationMatrix
 * (R = Rz(roll)*Ry(yaw)*Rx(pitch) convention). Approximate by design — good enough
 * for a threshold-based "looking away" check, not precise biomechanical pose.
 */
function decodeYawPitch(data: number[]): { yawDeg: number; pitchDeg: number } {
  const yawRad = Math.asin(clamp(-data[2], -1, 1));
  const pitchRad = Math.atan2(data[6], data[10]);
  return { yawDeg: toDeg(yawRad), pitchDeg: toDeg(pitchRad) };
}

const NOT_OK: FrameDetection = { faceCount: 0, yawDeg: null, pitchDeg: null, blendshapes: null, ok: false };

// detectForVideo requires each call's timestamp to strictly increase; guard against a
// non-increasing value (e.g. a stray duplicate call) permanently breaking every future
// detection with "timestamp mismatch" instead of just skipping the one bad tick.
let lastTimestampMs = -1;

let consecutiveErrors = 0;
const LOG_ERROR_EVERY = 10; // don't flood the console if the detector stays wedged for a while

export function detectFrame(landmarker: FaceLandmarker, video: HTMLVideoElement, timestampMs: number): FrameDetection {
  // readyState 2 (HAVE_CURRENT_DATA) is the first point a decoded frame actually exists — calling
  // detectForVideo before that (e.g. the instant srcObject is set, before the first frame paints)
  // can throw or hand back a meaningless zero-face result.
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return NOT_OK;
  }

  const safeTimestampMs = timestampMs > lastTimestampMs ? timestampMs : lastTimestampMs + 1;
  lastTimestampMs = safeTimestampMs;

  try {
    const result = landmarker.detectForVideo(video, safeTimestampMs);
    consecutiveErrors = 0;

    const faceCount = result.faceLandmarks?.length ?? 0;
    const matrix = result.facialTransformationMatrixes?.[0];
    const pose = matrix ? decodeYawPitch(matrix.data) : null;

    return {
      faceCount,
      yawDeg: pose?.yawDeg ?? null,
      pitchDeg: pose?.pitchDeg ?? null,
      blendshapes: result.faceBlendshapes?.[0] ?? null,
      ok: true,
    };
  } catch (err) {
    consecutiveErrors += 1;
    if (consecutiveErrors === 1 || consecutiveErrors % LOG_ERROR_EVERY === 0) {
      console.error(`Face detection failed (${consecutiveErrors} consecutive calls):`, err);
    }
    return NOT_OK;
  }
}
