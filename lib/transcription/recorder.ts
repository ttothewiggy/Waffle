import { MAX_RECORDING_SECONDS, MAX_AUDIO_BYTES, AUDIO_BITS_PER_SECOND } from './limits';
export type StopReason = 'finished' | 'hidden' | 'interrupted' | 'limit' | 'size';
export interface RecordedAudio { audio: Blob; seconds: number; reason: StopReason }
interface Callbacks {
  tick(seconds: number): void;
  checkpoint(value: RecordedAudio): void;
  ready(value: RecordedAudio): void;
  awake(held: boolean): void;
}
/** Owns microphone/wake-lock lifecycle. Errors do not throw away captured chunks. */
export class JournalRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private wake: WakeLockSentinel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private began = 0;
  private lastCheckpoint = 0;
  private reason: StopReason = 'finished';
  private stopped = false;
  private finalised = false;
  private finished: Promise<void>;
  private finish!: () => void;
  constructor(private callbacks: Callbacks) {
    this.finished = new Promise(resolve => { this.finish = resolve; });
  }
  private elapsed() { return Math.max(0, Math.floor((Date.now() - this.began) / 1000)); }
  private hidden = () => { if (document.hidden) void this.stop('hidden'); };
  private pageHidden = () => { void this.stop('hidden'); };
  private ended = () => { void this.stop('interrupted'); };
  private async lockScreen() {
    try {
      if (!navigator.wakeLock) { this.callbacks.awake(false); return; }
      const lock = await navigator.wakeLock.request('screen');
      if (this.stopped || this.finalised) { await lock.release(); return; }
      this.wake = lock;
      lock.addEventListener('release', () => this.callbacks.awake(false), { once: true });
      this.callbacks.awake(true);
    } catch { this.callbacks.awake(false); }
  }
  async start() {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      this.stream = mic;
      if (this.stopped || document.hidden) {
        this.clean(); this.finish(); throw new Error('Recording did not start. Keep Waffle open and try again.');
      }
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error('This browser cannot record supported audio. Try Chrome or Safari.');
      const r = new MediaRecorder(mic, { mimeType: mime, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      this.recorder = r;
      this.began = Date.now();
      r.ondataavailable = event => {
        if (!event.data.size || this.finalised) return;
        this.chunks.push(event.data); this.bytes += event.data.size;
        // Persist complete prefix chunks; some interrupted containers need the final
        // stop event to be playable, so recovery always offers playback/download.
        if (Date.now() - this.lastCheckpoint >= 5000) {
          this.lastCheckpoint = Date.now();
          this.callbacks.checkpoint(this.snapshot());
        }
        if (this.bytes >= MAX_AUDIO_BYTES - 64 * 1024) void this.stop('size');
      };
      r.onerror = () => { void this.stop('interrupted'); };
      r.onstop = () => this.finalise();
      for (const track of mic.getTracks()) track.addEventListener('ended', this.ended);
      document.addEventListener('visibilitychange', this.hidden);
      window.addEventListener('pagehide', this.pageHidden);
      r.start(1000);
      void this.lockScreen();
      this.timer = setInterval(() => {
        const seconds = this.elapsed(); this.callbacks.tick(seconds);
        if (seconds >= MAX_RECORDING_SECONDS) void this.stop('limit');
      }, 500);
    } catch (error) { this.stopped = true; this.clean(); this.finish(); throw error; }
  }
  private snapshot(): RecordedAudio {
    return { audio: new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' }), seconds: this.elapsed(), reason: this.reason };
  }
  stop(reason: StopReason = 'finished'): Promise<void> {
    if (!this.stopped) {
      this.stopped = true; this.reason = reason;
      if (this.timer) clearInterval(this.timer);
      if (this.wake) void this.wake.release().catch(() => {});
      if (this.recorder?.state === 'recording' || this.recorder?.state === 'paused') {
        try { this.recorder.stop(); }
        catch { this.reason = "interrupted"; this.finalise(); }
      }
      // getUserMedia may still be waiting. start() cleans up when it resolves.
    }
    return this.finished;
  }
  private finalise() {
    if (this.finalised) return;
    const result = this.snapshot();
    this.finalised = true; this.stopped = true;
    this.clean(); this.callbacks.ready(result); this.finish();
  }
  private clean() {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('pagehide', this.pageHidden);
    for (const track of this.stream?.getTracks() || []) { track.removeEventListener('ended', this.ended); track.stop(); }
    if (this.wake) void this.wake.release().catch(() => {});
  }
}
