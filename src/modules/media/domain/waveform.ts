import { WAVEFORM_POINTS } from './media-limits';

/**
 * Reduces raw mono PCM to the fixed-length bar chart the client draws under a voice note.
 *
 * This has to happen server-side: by the time the client has the file the audio is already
 * compressed, and decoding it on the phone just to draw 48 bars would cost more than playing it.
 *
 * Each bucket is the RMS of its samples — RMS, not peak, because peak makes every recording with a
 * single door slam in it look identical. The result is normalised against the loudest bucket, so a
 * quiet recording still fills the bubble instead of rendering as a flat line.
 */
export function computeWaveform(pcm: Buffer, points: number = WAVEFORM_POINTS): number[] {
  const sampleCount = Math.floor(pcm.length / 2); // 16-bit samples
  if (sampleCount === 0) {
    return new Array<number>(points).fill(0);
  }

  const perBucket = Math.max(1, Math.floor(sampleCount / points));
  const buckets: number[] = [];

  for (let bucket = 0; bucket < points; bucket += 1) {
    const start = bucket * perBucket;
    const end = bucket === points - 1 ? sampleCount : Math.min(start + perBucket, sampleCount);
    let sumOfSquares = 0;
    let counted = 0;
    for (let i = start; i < end; i += 1) {
      const sample = pcm.readInt16LE(i * 2) / 32768;
      sumOfSquares += sample * sample;
      counted += 1;
    }
    buckets.push(counted === 0 ? 0 : Math.sqrt(sumOfSquares / counted));
  }

  const loudest = Math.max(...buckets);
  if (loudest === 0) {
    return buckets.map(() => 0);
  }
  return buckets.map((value) => Math.round((value / loudest) * 100));
}
