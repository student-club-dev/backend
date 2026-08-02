import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { MediaKind } from '../domain/enums/media-kind.enum';
import { detectMediaType } from './media-type.detector';

let dir: string;
let counter = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'detector-spec-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The detector reads from disk now, so every fixture has to land there first. */
async function fileOf(bytes: Buffer): Promise<string> {
  counter += 1;
  const path = join(dir, `fixture-${counter}`);
  await writeFile(path, bytes);
  return path;
}

/** Real encoded bytes — the point of this module is that it does not trust anything else. */
async function image(format: 'jpeg' | 'png' | 'webp' | 'gif'): Promise<string> {
  const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } });
  return fileOf(
    format === 'gif' ? await base.gif().toBuffer() : await base.toFormat(format).toBuffer(),
  );
}

describe('detectMediaType', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('accepts a real %s as an IMAGE', async (format) => {
    const detected = await detectMediaType(await image(format), MediaKind.IMAGE, undefined);
    expect(detected?.mimeType).toBe(`image/${format}`);
  });

  it('accepts a real GIF as a GIF', async () => {
    const detected = await detectMediaType(await image('gif'), MediaKind.GIF, undefined);
    expect(detected).toEqual({ mimeType: 'image/gif', extension: 'gif' });
  });

  it('refuses a GIF uploaded as an IMAGE — the kind still decides the allowlist', async () => {
    expect(await detectMediaType(await image('gif'), MediaKind.IMAGE, undefined)).toBeNull();
  });

  it('ignores a lying Content-Type and goes by the bytes, for a kind that has an allowlist', async () => {
    // Claims to be a PDF; the bytes are a PNG. IMAGE_ORIGINAL accepts PNG, so the PNG wins and the
    // header is simply disregarded.
    const detected = await detectMediaType(
      await image('png'),
      MediaKind.IMAGE_ORIGINAL,
      'application/pdf',
    );
    expect(detected?.mimeType).toBe('image/png');
  });

  it('refuses an executable dressed up as an image', async () => {
    // ELF header — a real Linux binary starts exactly like this.
    const elf = await fileOf(
      Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(256)]),
    );
    expect(await detectMediaType(elf, MediaKind.IMAGE, 'image/png')).toBeNull();
    expect(await detectMediaType(elf, MediaKind.VIDEO, 'video/mp4')).toBeNull();
  });

  // Parity spec §1: the allowlist is gone for FILE, and with it every reason to return null there.
  // The delivery headers are what keeps this safe now, not a refusal at upload time.
  describe('kind = FILE accepts everything', () => {
    it('accepts an ELF binary', async () => {
      const elf = await fileOf(
        Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(256)]),
      );
      expect(await detectMediaType(elf, MediaKind.FILE, 'application/octet-stream')).not.toBeNull();
    });

    it('accepts a Windows executable', async () => {
      const mz = await fileOf(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256)]));
      expect(await detectMediaType(mz, MediaKind.FILE, undefined)).not.toBeNull();
    });

    // The exact case from the bug report: a plain screenshot sent as a document came back 422.
    it('accepts an ordinary JPEG screenshot', async () => {
      const detected = await detectMediaType(await image('jpeg'), MediaKind.FILE, 'image/jpeg');
      expect(detected).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    });

    it('accepts unidentifiable bytes with no declared type, as octet-stream', async () => {
      const detected = await detectMediaType(
        await fileOf(Buffer.from('plain')),
        MediaKind.FILE,
        undefined,
      );
      expect(detected).toEqual({ mimeType: 'application/octet-stream', extension: 'bin' });
    });

    it('accepts binary that claims to be text/plain instead of refusing it', async () => {
      const binary = await fileOf(Buffer.from([0x01, 0x02, 0x03, 0x00, 0x04, 0x05, 0x06, 0x07]));
      expect(await detectMediaType(binary, MediaKind.FILE, 'text/plain')).not.toBeNull();
    });

    it('reports the real type it sniffed, which is what the client draws an icon from', async () => {
      const pdf = await fileOf(Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n'));
      const detected = await detectMediaType(pdf, MediaKind.FILE, 'application/pdf');
      expect(detected?.mimeType).toBe('application/pdf');
    });
  });

  describe('kinds that still have an allowlist', () => {
    it('accepts signature-less text only when it really is text', async () => {
      // VOICE has an allowlist, so the signature-less branch still applies to it — but text is not
      // on that list, so it is refused whatever the header says.
      const csv = await fileOf(Buffer.from('ism,kurs\nAziz,2\n'));
      expect(await detectMediaType(csv, MediaKind.VOICE, 'text/csv')).toBeNull();
    });

    it('refuses unidentifiable bytes with no declared type at all', async () => {
      const bytes = await fileOf(Buffer.from('plain'));
      expect(await detectMediaType(bytes, MediaKind.STORY_VIDEO, undefined)).toBeNull();
    });
  });
});
