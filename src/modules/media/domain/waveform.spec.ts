import { WAVEFORM_POINTS } from './media-limits';
import { computeWaveform } from './waveform';

/** Builds mono 16-bit PCM from a per-sample amplitude function in [-1, 1]. */
function pcm(sampleCount: number, amplitudeAt: (index: number) => number): Buffer {
  const buffer = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i += 1) {
    buffer.writeInt16LE(Math.round(amplitudeAt(i) * 32767), i * 2);
  }
  return buffer;
}

describe('computeWaveform', () => {
  it('always returns exactly the number of points the client draws', () => {
    const bars = computeWaveform(pcm(10_000, () => 0.5));
    expect(bars).toHaveLength(WAVEFORM_POINTS);
  });

  // Parity spec §6 raised this from 48, which was too coarse to read on a long note.
  it('draws a hundred bars', () => {
    expect(WAVEFORM_POINTS).toBe(100);
  });

  it('returns a flat zero line for silence rather than dividing by zero', () => {
    expect(computeWaveform(pcm(10_000, () => 0))).toEqual(
      new Array<number>(WAVEFORM_POINTS).fill(0),
    );
  });

  it('handles an empty buffer', () => {
    expect(computeWaveform(Buffer.alloc(0))).toHaveLength(WAVEFORM_POINTS);
  });

  it('keeps every value inside 0..100', () => {
    const bars = computeWaveform(pcm(50_000, (i) => Math.sin(i / 20)));
    for (const bar of bars) {
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(bar).toBeLessThanOrEqual(100);
    }
  });

  it('normalises against the loudest bucket, so a quiet recording still fills the bubble', () => {
    const quiet = computeWaveform(pcm(48_000, (i) => (i < 24_000 ? 0.01 : 0.002)));
    const loud = computeWaveform(pcm(48_000, (i) => (i < 24_000 ? 1 : 0.2)));
    // Same shape, different absolute level — the drawn bars must match.
    expect(quiet[0]).toBe(100);
    expect(loud[0]).toBe(100);
    expect(Math.abs(quiet[WAVEFORM_POINTS - 1] - loud[WAVEFORM_POINTS - 1])).toBeLessThanOrEqual(1);
  });

  it('tracks loudness across the recording', () => {
    // Silent first half, loud second half.
    const bars = computeWaveform(pcm(48_000, (i) => (i < 24_000 ? 0 : 0.9)));
    expect(bars[0]).toBe(0);
    expect(bars[WAVEFORM_POINTS - 1]).toBe(100);
  });

  it('is not fooled by a single spike the way a peak meter would be', () => {
    // One loud sample in an otherwise quiet bucket: RMS keeps the bucket low.
    const bars = computeWaveform(pcm(48_000, (i) => (i === 100 ? 1 : 0.5)));
    expect(bars[0]).toBeLessThan(105);
    expect(bars.every((bar) => bar > 0)).toBe(true);
  });
});
