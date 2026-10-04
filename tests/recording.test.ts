import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { JournalRecorder, type RecordedAudio } from '../lib/transcription/recorder';
import { RecordingDraftStore } from '../lib/transcription/draft';
import { MAX_RECORDING_SECONDS, MAX_AUDIO_BYTES, AUDIO_BITS_PER_SECOND } from '../lib/transcription/limits';
class Track extends EventTarget { stopped = false; stop() { this.stopped = true; } }
class Wake extends EventTarget { released = false; async release() { this.released = true; this.dispatchEvent(new Event('release')); } }
class Recorder {
  static current: Recorder;
  static options: MediaRecorderOptions;
  static isTypeSupported() { return true; }
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null; onstop: (() => void) | null = null;
  constructor(_stream: unknown, options: MediaRecorderOptions) { Recorder.current = this; Recorder.options = options; }
  start() { this.state = 'recording'; }
  data(text: string | Uint8Array) { this.ondataavailable?.({ data: new Blob([typeof text === 'string' ? text : new Uint8Array(text)]) }); }
  stop() { this.state = 'inactive'; queueMicrotask(() => { this.data('tail'); this.onstop?.(); }); }
}
async function withBrowser(work: (context: { track: Track; wake: Wake; doc: EventTarget & { hidden: boolean }; step(seconds: number): void; results: RecordedAudio[]; checkpoints: RecordedAudio[]; recorder: JournalRecorder; awake: boolean[] }) => Promise<void>) {
  const names = ['navigator', 'document', 'window', 'MediaRecorder', 'setInterval', 'clearInterval'];
  const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const track = new Track(), wake = new Wake(), doc = Object.assign(new EventTarget(), { hidden: false });
  let tick = () => {}, now = 100000;
  const dateNow = Date.now; Date.now = () => now;
  const values = { navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) }, wakeLock: { request: async () => wake } },
    document: doc, window: new EventTarget(), MediaRecorder: Recorder,
    setInterval: (callback: () => void) => { tick = callback; return 1; }, clearInterval: () => {} };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const results: RecordedAudio[] = [], checkpoints: RecordedAudio[] = [], awake: boolean[] = [];
  const recorder = new JournalRecorder({ tick: () => {}, ready: value => results.push(value), checkpoint: value => checkpoints.push(value), awake: value => awake.push(value) });
  try { await work({ track, wake, doc, results, checkpoints, awake, recorder, step(seconds) { now += seconds * 1000; tick(); } }); }
  finally { await recorder.stop(); Date.now = dateNow; for (const [name, d] of saved) { if (d) Object.defineProperty(globalThis, name, d); else Reflect.deleteProperty(globalThis, name); } }
}
test('screen hiding stops safely, retains the final audio chunk and releases microphone and wake lock', async () => {
  await withBrowser(async ({ recorder, doc, results, checkpoints, track, wake, awake }) => {
    await recorder.start(); Recorder.current.data('hello');
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); await recorder.stop();
    assert.equal(results[0].reason, 'hidden'); assert.equal(await results[0].audio.text(), 'hellotail');
    assert.equal(await checkpoints[0].audio.text(), 'hello');
    assert.ok(track.stopped); assert.ok(wake.released); assert.ok(awake.includes(true));
  });
});
test('recorder errors preserve audio instead of resetting to an empty recording', async () => {
  await withBrowser(async ({ recorder, results }) => {
    await recorder.start(); Recorder.current.data('keep me'); Recorder.current.onerror?.(); await recorder.stop();
    assert.equal(results[0].reason, 'interrupted'); assert.equal(await results[0].audio.text(), 'keep metail');
  });
});
test('ten minutes is the app timer, with a separate compressed upload guard', async () => {
  assert.equal(MAX_RECORDING_SECONDS, 600); assert.equal(AUDIO_BITS_PER_SECOND, 32000);
  await withBrowser(async ({ recorder, step, results }) => {
    await recorder.start(); Recorder.current.data('speech'); step(180);
    assert.equal(Recorder.current.state, 'recording'); step(420); await recorder.stop();
    assert.equal(results[0].reason, 'limit'); assert.equal(results[0].seconds, 600);
  });
});
test('size limits retain oversized final chunks for download rather than deleting them', async () => {
  await withBrowser(async ({ recorder, results }) => {
    await recorder.start(); Recorder.current.data(new Uint8Array(MAX_AUDIO_BYTES + 1)); await recorder.stop();
    assert.equal(results[0].reason, 'size'); assert.ok(results[0].audio.size > MAX_AUDIO_BYTES);
  });
});
test('an ended microphone track preserves the recording', async () => {
  await withBrowser(async ({ recorder, track, results }) => {
    await recorder.start(); Recorder.current.data('audio'); track.dispatchEvent(new Event('ended')); await recorder.stop();
    assert.equal(results[0].reason, 'interrupted'); assert.equal(await results[0].audio.text(), 'audiotail');
  });
});
test('a denied wake lock does not prevent recording', async () => {
  await withBrowser(async ({ recorder, awake, results }) => {
    Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { throw new Error('low battery'); } } });
    await recorder.start(); Recorder.current.data('speech'); await recorder.stop();
    assert.ok(awake.includes(false)); assert.equal(await results[0].audio.text(), 'speechtail');
  });
});
test('recovery persists audio and transcript by account and day, and old cleanup cannot remove a newer draft', async () => {
  const name = crypto.randomUUID(), store = new RecordingDraftStore(name), key = 'user-a:2026-10-03';
  const draft = { key, id: 'old', audio: new Blob(['speech'], { type: 'audio/webm' }), transcript: 'My day', seconds: 44, at: new Date().toISOString() };
  await store.save(draft);
  const reopened = new RecordingDraftStore(name);
  assert.equal(await (await reopened.read(key))!.audio.text(), 'speech');
  assert.equal((await reopened.read(key))!.transcript, 'My day');
  assert.equal(await reopened.read('user-b:2026-10-03'), undefined);
  assert.equal(await reopened.read('user-a:2026-10-02'), undefined);
  await store.save({ ...draft, id: 'new' }); await store.remove(key, 'old');
  assert.equal((await store.read(key))!.id, 'new');
  await store.remove(key, 'new'); assert.equal(await store.read(key), undefined);
});
