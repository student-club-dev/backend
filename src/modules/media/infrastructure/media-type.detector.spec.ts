import sharp from 'sharp';
import { MediaKind } from '../domain/enums/media-kind.enum';
import { detectMediaType } from './media-type.detector';

/** Real encoded bytes — the point of this module is that it does not trust anything else. */
async function image(format: 'jpeg' | 'png' | 'webp' | 'gif'): Promise<Buffer> {
  const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } });
  return format === 'gif' ? base.gif().toBuffer() : base.toFormat(format).toBuffer();
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

  it('refuses a GIF uploaded as an IMAGE — the kind decides the allowlist', async () => {
    expect(await detectMediaType(await image('gif'), MediaKind.IMAGE, undefined)).toBeNull();
  });

  it('ignores a lying Content-Type and goes by the bytes', async () => {
    // Claims to be a PDF; the bytes are a PNG. Under kind=FILE, PNG is not allowed.
    const detected = await detectMediaType(await image('png'), MediaKind.FILE, 'application/pdf');
    expect(detected).toBeNull();
  });

  it('refuses an executable dressed up as an image', async () => {
    // ELF header — a real Linux binary starts exactly like this.
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(256)]);
    expect(await detectMediaType(elf, MediaKind.IMAGE, 'image/png')).toBeNull();
    expect(await detectMediaType(elf, MediaKind.FILE, 'application/pdf')).toBeNull();
  });

  it('refuses a Windows executable under any kind', async () => {
    const mz = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256)]);
    for (const kind of Object.values(MediaKind)) {
      expect(await detectMediaType(mz, kind, 'application/zip')).toBeNull();
    }
  });

  it('accepts a real PDF as a FILE', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
    const detected = await detectMediaType(pdf, MediaKind.FILE, 'application/pdf');
    expect(detected?.mimeType).toBe('application/pdf');
  });

  it('accepts signature-less text only when it really is text', async () => {
    const csv = Buffer.from('ism,kurs\nAziz,2\n');
    expect(await detectMediaType(csv, MediaKind.FILE, 'text/csv')).toEqual({
      mimeType: 'text/csv',
      extension: 'csv',
    });
  });

  it('refuses binary claiming to be text/plain', async () => {
    // No magic bytes, but full of control characters — not a document.
    const binary = Buffer.from([0x01, 0x02, 0x03, 0x00, 0x04, 0x05, 0x06, 0x07]);
    expect(await detectMediaType(binary, MediaKind.FILE, 'text/plain')).toBeNull();
  });

  it('refuses unidentifiable bytes with no declared type at all', async () => {
    expect(await detectMediaType(Buffer.from('plain'), MediaKind.FILE, undefined)).toBeNull();
  });
});
