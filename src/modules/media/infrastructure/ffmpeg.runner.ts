import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/** Never let a malformed upload pin a worker forever. */
const TIMEOUT_MS = 120_000;
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
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
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
      timeout: TIMEOUT_MS,
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

  /** Re-encodes a video to the baseline profile every mobile device can hardware-decode. */
  async transcodeVideo(input: string, output: string): Promise<void> {
    await this.run([
      '-i',
      input,
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      '-c:v',
      'libx264',
      '-profile:v',
      'baseline',
      '-level',
      '3.1',
      '-crf',
      '24',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      output,
    ]);
  }

  /** Grabs a poster frame one second in (or at the start, for anything shorter). */
  async extractFrame(input: string, output: string, atSeconds: number): Promise<void> {
    await this.run(['-ss', String(atSeconds), '-i', input, '-frames:v', '1', '-q:v', '3', output]);
  }

  /**
   * Decodes audio to raw mono PCM so the caller can compute a waveform. 8 kHz is plenty: the output
   * is 48 bars, and resampling down first keeps the decode cheap.
   */
  async decodePcm(input: string): Promise<Buffer> {
    const { stdout } = await run(
      this.ffmpegPath,
      ['-v', 'error', '-i', input, '-f', 's16le', '-ac', '1', '-ar', '8000', '-'],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'buffer' },
    );
    return stdout;
  }
}
