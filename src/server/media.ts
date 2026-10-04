import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Largest image accepted by an upload. */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** Image types that can be uploaded, with the file extension they are stored under. */
export const MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;

export type MediaType = keyof typeof MEDIA_TYPES;

const TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(MEDIA_TYPES).map(([type, ext]) => [ext, type as MediaType]),
) as Record<string, MediaType>;

/** Names of stored files: a content-hash prefix and a known extension. Nothing else is served. */
const FILE_NAME = /^[0-9a-f]{24}\.(jpg|png|webp|gif)$/;

export class MediaError extends Error {}

export interface MediaFile {
  path: string;
  size: number;
  type: MediaType;
}

/** The supported image type named by a Content-Type header, or null. */
export function mediaTypeOf(contentType: string | undefined): MediaType | null {
  const essence = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  return Object.hasOwn(MEDIA_TYPES, essence) ? (essence as MediaType) : null;
}

/** Detects a supported image from its first bytes (null for anything else, SVG included). */
export function sniffImage(data: Uint8Array): MediaType | null {
  const has = (offset: number, signature: string) =>
    data.length >= offset + signature.length &&
    [...signature].every((char, i) => data[offset + i] === char.charCodeAt(0));
  if (has(0, '\xff\xd8\xff')) return 'image/jpeg';
  if (has(0, '\x89PNG\r\n\x1a\n')) return 'image/png';
  if (has(0, 'GIF87a') || has(0, 'GIF89a')) return 'image/gif';
  if (has(0, 'RIFF') && has(8, 'WEBP')) return 'image/webp';
  return null;
}

/** File name an image is stored under: the same bytes always get the same name. */
export function mediaFileName(type: MediaType, data: Uint8Array): string {
  return `${createHash('sha256').update(data).digest('hex').slice(0, 24)}.${MEDIA_TYPES[type]}`;
}

/** Uploaded images (centre photos), kept in one folder and named by content hash. */
export class MediaStore {
  constructor(private readonly dir: string) {}

  /** Stores an image and returns its file name. Rejects data that is not an image of `type`. */
  async save(type: MediaType, data: Uint8Array): Promise<string> {
    if (sniffImage(data) !== type) {
      throw new MediaError('The file is not a JPEG, PNG, WebP or GIF image of the declared type');
    }
    const name = mediaFileName(type, data);
    const file = join(this.dir, name);
    if (await this.find(name)) return name;
    await mkdir(this.dir, { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, data);
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true });
    }
    return name;
  }

  /** Looks up a stored file by name; null for unknown or malformed names. */
  async find(name: string): Promise<MediaFile | null> {
    const ext = FILE_NAME.exec(name)?.[1];
    if (!ext) return null;
    const path = join(this.dir, name);
    try {
      const info = await stat(path);
      return info.isFile() ? { path, size: info.size, type: TYPE_BY_EXTENSION[ext]! } : null;
    } catch {
      return null;
    }
  }
}
