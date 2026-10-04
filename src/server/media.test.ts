import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MediaError, mediaFileName, MediaStore, mediaTypeOf, sniffImage } from './media.js';

const bytes = (head: string, tail = 'pixels') => Buffer.from(head + tail, 'latin1');

const SAMPLE_IMAGES = {
  'image/jpeg': bytes('\xff\xd8\xff\xe0\x00\x10JFIF\x00'),
  'image/png': bytes('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'),
  'image/gif': bytes('GIF89a\x01\x00\x01\x00'),
  'image/webp': bytes('RIFF\x24\x00\x00\x00WEBPVP8 '),
} as const;

describe('mediaTypeOf', () => {
  it('accepts the supported image types, ignoring case and parameters', () => {
    expect(mediaTypeOf('image/jpeg')).toBe('image/jpeg');
    expect(mediaTypeOf('IMAGE/PNG; charset=binary')).toBe('image/png');
    expect(mediaTypeOf(' image/webp ')).toBe('image/webp');
  });

  it('rejects everything else', () => {
    for (const type of [
      undefined,
      '',
      'image/svg+xml',
      'text/html',
      'image/jpg',
      'constructor',
      'toString',
    ]) {
      expect(mediaTypeOf(type)).toBeNull();
    }
  });
});

describe('sniffImage', () => {
  it('recognises JPEG, PNG, GIF and WebP signatures', () => {
    for (const [type, data] of Object.entries(SAMPLE_IMAGES)) expect(sniffImage(data)).toBe(type);
    expect(sniffImage(bytes('GIF87a'))).toBe('image/gif');
  });

  it('rejects SVG, other formats and truncated data', () => {
    expect(
      sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    ).toBeNull();
    expect(sniffImage(bytes('<?xml version="1.0"?><svg/>'))).toBeNull();
    expect(sniffImage(bytes('RIFF\x24\x00\x00\x00WAVEfmt '))).toBeNull();
    expect(sniffImage(bytes('\xff\xd8', ''))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});

describe('MediaStore', () => {
  const store = () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'finwheel-media-')), 'media');
    return { dir, media: new MediaStore(dir) };
  };

  it('stores images under a content hash and finds them again', async () => {
    const { dir, media } = store();
    const data = SAMPLE_IMAGES['image/png'];
    const name = await media.save('image/png', data);
    expect(name).toMatch(/^[0-9a-f]{24}\.png$/);
    expect(name).toBe(mediaFileName('image/png', data));
    expect(readFileSync(join(dir, name))).toEqual(data);
    expect(await media.find(name)).toEqual({ path: join(dir, name), size: data.length, type: 'image/png' });
  });

  it('is idempotent', async () => {
    const { dir, media } = store();
    const data = SAMPLE_IMAGES['image/jpeg'];
    const [a, b] = await Promise.all([media.save('image/jpeg', data), media.save('image/jpeg', data)]);
    expect(a).toBe(b);
    expect(await media.save('image/jpeg', data)).toBe(a);
    expect(readdirSync(dir)).toEqual([a]);
  });

  it('rejects data that does not match the declared type', async () => {
    const { media } = store();
    await expect(media.save('image/png', SAMPLE_IMAGES['image/jpeg'])).rejects.toBeInstanceOf(MediaError);
    await expect(media.save('image/gif', bytes('<svg/>'))).rejects.toBeInstanceOf(MediaError);
  });

  it('only finds well-formed names inside its folder', async () => {
    const { dir, media } = store();
    const name = await media.save('image/gif', SAMPLE_IMAGES['image/gif']);
    writeFileSync(join(dir, 'notes.txt'), 'secret');
    for (const bad of [
      'notes.txt',
      name.toUpperCase(),
      `${name}.tmp`,
      `../media/${name}`,
      `x/../${name}`,
      name.replace('.gif', '.svg'),
      '',
    ]) {
      expect(await media.find(bad)).toBeNull();
    }
    expect(await media.find(`${'0'.repeat(24)}.gif`)).toBeNull();
  });
});
