// At 32 kbit/s, ten minutes of speech is about 2.4 MB. Browsers may ignore the
// bitrate request, so the byte guard remains authoritative below Vercel's limit.
export const MAX_RECORDING_SECONDS = 10 * 60;
export const AUDIO_BITS_PER_SECOND = 32000;
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
