import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/** Never let a malformed upload pin a worker forever. Probing is metadata only, so it is quick. */
const PROBE_TIMEOUT_MS = 60_000;
/**
 * Encoding gets far longer than probing: parity spec §2 removed the duration ceiling, so an hour of
 * 4K is now a legitimate upload and two minutes would kill it halfway through. This is a deadlock
 * guard, not a performance budget.
 */
const ENCODE_TIMEOUT_MS = 60 * 60_000;
/** ffprobe JSON is small; a transcode writes to disk, so neither needs a large pipe. */
const MAX_BUFFER = 16 * 1024 * 1024;

/** What `ffprobe` can tell us about a media file. Fields are absent for streams that lack them. */
export interface ProbeResult {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

/**
 * Thin wrapper over the ffmpeg/ffprobe binaries.
 *
 * `execFile` — not `exec` — is deliberate: arguments are passed as an array and never go through a
 * shell, so a filename can never become part of a command.
 */
export class FfmpegRunner {
  constructor(
    private readonly ffmpegPath: string,
    private readonly ffprobePath: string,
  ) {}

  /** Reads duration, dimensions and codecs. Throws if the file is not decodable. */
  async probe(path: string): Promise<ProbeResult> {
    const { stdout } = await run(
      this.ffprobePath,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
    );
    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const streams = parsed.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === 'video');
    const audio = streams.find((stream) => stream.codec_type === 'audio');
    const duration = Number(parsed.format?.duration);

    return {
      durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
      width: video?.width ?? null,
      height: video?.height ?? null,
      hasAudio: audio !== undefined,
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
    };
  }

  /** Runs ffmpeg with the given arguments, overwriting the output. */
  async run(args: string[]): Promise<void> {
    await run(this.ffmpegPath, ['-y', '-v', 'error', ...args], {
      timeout: ENCODE_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
  }

  /**
   * Converts anything animated into a **silent, looping MP4**, which is what "GIF" means in a modern
   * chat. The same five-second animation is ~8 MB as a GIF and ~300 KB as H.264, so this is the
   * difference between a usable feature and a data-plan complaint.
   */
  async toLoopingMp4(input: string, output: string): Promise<void> {
    await this.run([
      '-i',
      input,
      '-movflags',
      '+faststart', // metadata first: playback starts before the file finishes downloading
      '-pix_fmt',
      'yuv420p', // without this iOS AVPlayer refuses the file
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2', // H.264 needs even dimensions
      '-an', // no audio track at all
      '-c:v',
      'libx264',
      '-crf',
      '26',
      '-preset',
      'veryfast',
      output,
    ]);
  }

  /**
   * Re-encodes a video to a profile every mobile device can hardware-decode.
   *
   * Two ladders (parity spec §4.2). `AUTO` is the one that shipped before the `quality` field
   * existed — 720p baseline, small and universally playable. `HIGH` keeps 1080p and a lower CRF for
   * a sender who chose detail over data, and steps up to the `high` profile, which every device that
   * can usefully show 1080p supports anyway.
   *
   * `ORIGINAL` never reaches here: it is not queued at all.
   */
  async transcodeVideo(input: string, output: string, high = false): Promise<void> {
    const [maxWidth, maxHeight] = high ? [1920, 1080] : [1280, 720];
    await this.run([
      '-i',
      input,
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-c:v',
      'libx264',
      '-profile:v',
      high ? 'high' : 'baseline',
      '-level',
      high ? '4.1' : '3.1',
      '-crf',
      high ? '21' : '24',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-b:a',
      high ? '128k' : '96k',
      output,
    ]);
  }

  /** Grabs a poster frame one second in (or at the start, for anything shorter). */
  async extractFrame(input: string, output: string, atSeconds: number): Promise<void> {
    await this.run(['-ss', String(atSeconds), '-i', input, '-frames:v', '1', '-q:v', '3', output]);
  }

  /**
   * Decodes audio to raw mono PCM so the caller can compute a waveform. 8 kHz is plenty: the output
   * is a hundred bars, and resampling down first keeps the decode cheap.
   *
   * `maxBuffer` bounds this rather than the duration limit that used to: 16 MB of 8 kHz 16-bit mono
   * is a bit under three hours, and a voice note longer than that is not a voice note.
   */
  async decodePcm(input: string): Promise<Buffer> {
    const { stdout } = await run(
      this.ffmpegPath,
      ['-v', 'error', '-i', input, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
      { timeout: ENCODE_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'buffer' },
    );
    return stdout;
  }
}
