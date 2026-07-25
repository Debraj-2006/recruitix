import { assessFrameQuality, loadFaceModels } from '@/lib/faceEngine';
import { db } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface ProctoringConfig {
  sessionId: string;
  userId: string;
  laptopVideo: HTMLVideoElement | null;
  mobileVideo: HTMLVideoElement | null;
  screenStream: MediaStream | null;
  micStream: MediaStream | null;
}

class ProctoringEngine {
  private config: ProctoringConfig | null = null;
  private intervalId: number | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;

  async init(config: ProctoringConfig) {
    this.config = config;
    await loadFaceModels();
    
    // Setup Audio monitoring
    if (config.micStream) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      const source = this.audioContext.createMediaStreamSource(config.micStream);
      source.connect(this.analyser);
      this.analyser.fftSize = 256;
    }

    // Monitor screen share stop
    if (config.screenStream) {
      config.screenStream.getVideoTracks()[0].onended = () => {
        this.logViolation('SCREEN_SHARE_STOPPED', 'Screen sharing was stopped by the user.');
      };
    }
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(this.runChecks.bind(this), 2000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private async runChecks() {
    if (!this.config) return;

    // 1. Check Laptop Camera
    if (this.config.laptopVideo && this.config.laptopVideo.readyState >= 2) {
      try {
        const quality = await assessFrameQuality(this.config.laptopVideo);
        if (!quality.ok) {
          this.logViolation('LAPTOP_CAMERA_ALERT', `Laptop Camera: ${quality.reason}`);
        }
      } catch (err) {
        console.error('Laptop face check failed:', err);
      }
    }

    // 2. Check Mobile Camera (if present)
    if (this.config.mobileVideo && this.config.mobileVideo.readyState >= 2) {
      try {
        const quality = await assessFrameQuality(this.config.mobileVideo);
        if (!quality.ok && quality.reason !== 'off_center') { // Mobile might not be centered perfectly
          this.logViolation('MOBILE_CAMERA_ALERT', `Mobile Camera: ${quality.reason}`);
        }
      } catch (err) {
        console.error('Mobile face check failed:', err);
      }
    }

    // 3. Check Mic Volume
    if (this.analyser) {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      if (average > 50) { // arbitrary threshold for loud noise/speaking
        this.logViolation('AUDIO_ALERT', 'Loud noise or speaking detected.');
      }
    }
  }

  private async logViolation(type: string, message: string) {
    if (!this.config) return;
    try {
      await addDoc(collection(db, 'exam_violations'), {
        sessionId: this.config.sessionId,
        userId: this.config.userId,
        type,
        message,
        timestamp: serverTimestamp(),
      });
      console.warn(`[VIOLATION] ${type}: ${message}`);
    } catch (err) {
      console.error('Failed to log violation:', err);
    }
  }
}

export const proctoringEngine = new ProctoringEngine();
