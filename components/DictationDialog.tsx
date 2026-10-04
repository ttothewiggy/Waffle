"use client";
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, Download } from 'lucide-react';
import { useJournalAccount } from './CloudAccount';
import AiAccess, { useAiAccess } from './AiAccess';
import { aiHeaders } from '@/lib/ai/session';
import { JournalRecorder, type RecordedAudio } from '@/lib/transcription/recorder';
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from '@/lib/transcription/limits';
import { recordingDrafts } from '@/lib/transcription/draft';
type Phase = 'loading' | 'idle' | 'starting' | 'recording' | 'recorded' | 'sending' | 'review' | 'adding';
export default function DictationDialog({ date, close, append }: {
  date: string; close: () => void; append: (text: string) => Promise<void>;
}) {
  const { account } = useJournalAccount();
  const access = useAiAccess();
  const key = `${account?.id || 'device'}:${date}`;
  const dialog = useRef<HTMLDialogElement>(null), recorder = useRef<JournalRecorder | null>(null);
  const mounted = useRef(true), controller = useRef<AbortController | null>(null);
  const draftId = useRef(''), saving = useRef(Promise.resolve()), discarded = useRef(false), action = useRef(false);
  const recoverySaved = useRef(false), added = useRef(false), closing = useRef(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [audio, setAudio] = useState<Blob | null>(null), [url, setUrl] = useState(''), [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState(''), [awake, setAwake] = useState(false), [supported, setSupported] = useState(false);
  const latest = useRef({ audio, seconds, transcript }); latest.current = { audio, seconds, transcript };
  function persist(value: { audio: Blob; seconds: number; transcript: string }) {
    if (!value.audio.size || discarded.current) return;
    const id = draftId.current;
    saving.current = saving.current.catch(() => {}).then(async () => {
      if (discarded.current) return;
      try { await recordingDrafts.save({ ...value, key, id, at: new Date().toISOString() }); recoverySaved.current = true; if (mounted.current) setStorageError(''); }
      catch { recoverySaved.current = false; if (mounted.current) setStorageError('Could not save a recovery copy. Keep this window open and download the audio before leaving.'); }
    });
  }
  useEffect(() => {
    mounted.current = true; dialog.current?.showModal();
    setSupported(!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
    void recordingDrafts.read(key).then(draft => {
      if (!mounted.current) return;
      if (draft) {
        recoverySaved.current = true; draftId.current = draft.id; setAudio(draft.audio); setSeconds(draft.seconds); setTranscript(draft.transcript);
        setPhase(draft.transcript ? 'review' : 'recorded');
        setNotice('Recovered your unfinished recording from this device. Play it back before transcribing.');
      } else setPhase('idle');
    }).catch(() => { if (mounted.current) { setStorageError('Recovery storage is unavailable. Keep this window open until you finish.'); setPhase('idle'); } });
    return () => {
      mounted.current = false; void recorder.current?.stop('hidden'); controller.current?.abort();
    };
  }, [key]);
  useEffect(() => {
    if (!audio) { setUrl(''); return; }
    const value = URL.createObjectURL(audio); setUrl(value); return () => URL.revokeObjectURL(value);
  }, [audio]);
  useEffect(() => {
    if (!audio || phase === 'loading' || discarded.current) return;
    const timer = setTimeout(() => persist({ audio, seconds, transcript }), 350);
    return () => clearTimeout(timer);
  }, [audio, transcript, seconds, phase]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (phase === 'recording' || phase === 'starting' || storageError) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [phase, storageError]);
  async function start() {
    if (!access.allowed || action.current) return;
    if (audio && !window.confirm('Replace your previous recording? Download it first if you want to keep it.')) return;
    action.current = true; discarded.current = false; draftId.current = crypto.randomUUID();
    recoverySaved.current = false; added.current = false;
    setError(''); setNotice(''); setAwake(false); setPhase('starting');
    const retain = (value: RecordedAudio) => persist({ ...value, transcript: '' });
    const r = new JournalRecorder({
      tick: value => { if (mounted.current) setSeconds(value); },
      awake: held => { if (mounted.current) setAwake(held); },
      checkpoint: retain,
      ready: value => {
        retain(value);
        if (!mounted.current || discarded.current) return;
        latest.current = { audio: value.audio, seconds: value.seconds, transcript: '' };
        setSeconds(value.seconds); setAudio(value.audio); setPhase(value.audio.size ? 'recorded' : 'idle');
        if (!value.audio.size) setError('No audio was captured. Check microphone access and try again.');
        else setNotice(value.reason === 'hidden' ? 'Recording stopped when Waffle left the screen. The captured audio is here—play it back, then transcribe or download it.'
          : value.reason === 'interrupted' ? 'The microphone was interrupted. We kept the audio received so far; check playback before transcribing.'
          : value.reason === 'limit' ? 'Your ten-minute recording is ready.'
          : value.reason === 'size' ? 'This browser reached the audio size limit. Your recording is here; shorter recordings may be needed on this device.' : 'Recording ready.');
      },
    });
    recorder.current = r;
    try { await r.start(); if (mounted.current) { setAudio(null); setTranscript(''); setSeconds(0); setPhase('recording'); } }
    catch (e) {
      if (mounted.current) { setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Allow microphone access in your browser settings, then try again.' : e instanceof Error ? e.message : 'Could not start recording.'); setPhase(audio ? 'recorded' : 'idle'); }
    } finally { action.current = false; }
  }
  async function transcribe() {
    if (!audio || !access.allowed || audio.size > MAX_AUDIO_BYTES || action.current) return;
    action.current = true; setError(''); setPhase('sending');
    const c = new AbortController(); controller.current = c;
    const timeout = setTimeout(() => c.abort(), 65000);
    try {
      const form = new FormData(); form.set('audio', audio, audio.type.includes('mp4') ? 'waffle.m4a' : 'waffle.webm');
      const response = await fetch('/api/transcribe', { method: 'POST', headers: await aiHeaders(), body: form, signal: c.signal });
      const result = await response.json().catch(() => ({ error: 'Could not read the transcription response. Your audio is still here.' }));
      if (!response.ok) throw new Error(result.error || 'Transcription failed.');
      if (typeof result.text !== 'string') throw new Error('No transcript returned.');
      if (mounted.current) { setTranscript(result.text); setPhase('review'); persist({ audio, seconds, transcript: result.text }); }
    } catch (e) {
      if (mounted.current) { setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Transcription timed out or was cancelled. Your recording is saved here; you can retry.'); setPhase('recorded'); }
    } finally { clearTimeout(timeout); action.current = false; }
  }
  async function dismiss() {
    if (phase === 'adding' || closing.current) return false;
    if (phase === 'recording' && !window.confirm('Stop recording and keep it on this device for later?')) return false;
    closing.current = true;
    controller.current?.abort();
    if (phase === 'starting') { close(); return true; }
    await recorder.current?.stop();
    const value = latest.current;
    if (value.audio) persist({ ...value, audio: value.audio });
    await saving.current;
    if (value.audio && !recoverySaved.current) {
      setError('Your recording could not be saved for later. Download it and discard this copy, or finish transcribing before closing.');
      closing.current = false; return false;
    }
    close(); return true;
  }
  async function discard() {
    if (action.current || !window.confirm('Discard this recording and transcript from this device?')) return;
    action.current = true;
    try {
    discarded.current = true;
    await saving.current; await recordingDrafts.remove(key, draftId.current);
    setAudio(null); setTranscript(''); setNotice(''); setPhase('idle');
    } finally { action.current = false; }
  }
  return <dialog ref={dialog} className="journal-dialog" aria-labelledby="dictation-title" onCancel={event => { event.preventDefault(); void dismiss(); }}>
    <div className="dialog-heading"><div><span className="eyebrow">SAY YOUR PIECE</span><h2 id="dictation-title">Have a waffle</h2></div>
      <button onClick={() => void dismiss()} aria-label="Close dictation" disabled={phase === 'adding'}><X /></button></div>
    <p>For your entry on {date}. Record up to {MAX_RECORDING_SECONDS / 60} minutes, then review your words.</p>
    <p className="dialog-note">Unfinished audio is kept on this device until you add the transcript or discard it. It is not synced to other devices. Tapping Transcribe sends audio through Waffle to OpenAI and needs an internet connection.</p>
    <AiAccess access={access} close={dismiss} />
    {!supported && phase !== 'loading' && <p>This browser cannot record audio. Try Chrome or Safari.</p>}
    <div className="recording-status" role="status">{phase === 'loading' ? 'Checking for an unfinished recording…' : phase === 'recording'
      ? `Recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : phase === 'starting' ? 'Waiting for microphone permission…'
      : phase === 'sending' ? 'Turning your waffle into words…' : phase === 'review' ? 'Your words, ready to review' : phase === 'adding' ? 'Saving your words…' : audio ? 'Recording ready' : 'Make yourself comfortable.'}</div>
    {phase === 'recording' && <p role="status" className="dialog-note">{awake ? 'Keeping the screen awake while you record.' : 'Keep Waffle visible. This device could not keep the screen awake; check its screen timeout.'}</p>}
    {supported && (phase === 'idle' || phase === 'recorded') && <button className="primary" disabled={!access.allowed} onClick={() => void start()}><Mic size={18} />{audio ? 'Record again' : 'Start recording'}</button>}
    {phase === 'recording' && <button className="primary" onClick={() => void recorder.current?.stop()}><Square size={18} />Stop recording</button>}
    {url && <><audio className="recording-player" controls src={url} /><a className="secondary" href={url} download={`waffle-${date}.${audio?.type.includes('mp4') ? 'm4a' : 'webm'}`}><Download size={16} /> Download recording</a></>}
    {audio && audio.size > MAX_AUDIO_BYTES && <p role="alert" className="dialog-error">This recording exceeds the upload limit. Download it to keep it, then make a shorter recording. It has not been discarded.</p>}
    {phase === 'recorded' && <button className="primary" disabled={!access.allowed || !audio?.size || audio.size > MAX_AUDIO_BYTES} onClick={() => void transcribe()}>Transcribe recording</button>}
    {phase === 'sending' && <button className="secondary" onClick={() => controller.current?.abort()}>Cancel transcription</button>}
    {(phase === 'review' || phase === 'adding') && <>
      <label className="field-label" htmlFor="transcript">Review and edit your transcript</label>
      <textarea id="transcript" className="transcript" value={transcript} disabled={phase === 'adding'} onChange={event => setTranscript(event.target.value)} />
      <button className="primary" disabled={!transcript.trim() || phase === 'adding'} onClick={async () => {
        if (action.current) return; action.current = true; setPhase('adding'); setError('');
        try { if (!added.current) { await append(transcript.trim()); added.current = true; } discarded.current = true; await saving.current; await recordingDrafts.remove(key, draftId.current); close(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not save your words. Your recording is still here.'); setPhase('review'); }
        finally { action.current = false; }
      }}>Add to this day</button><p className="dialog-note">Your existing writing stays; this is added underneath.</p>
    </>}
    {audio && (phase === 'recorded' || phase === 'review') && <button className="secondary" onClick={() => void discard().catch(() => setError('Could not remove this recording. Please retry.'))}>Discard recording</button>}
    {notice && <p className="dialog-note" role="status">{notice}</p>}
    {storageError && <p className="dialog-error" role="alert">{storageError}</p>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
  </dialog>;
}
