/**
 * Image import: dropped or picked files become content-addressed project
 * assets plus their decoded pixel size. Files are handled one at a time, so a
 * batch of large photos never holds more than one file and one decode in
 * memory, and the size from the header is checked before decoding, so a
 * small file that inflates to gigabytes (a "decompression bomb") is refused
 * up front. An image whose header does not state its size is never decoded.
 */
import type { AssetInfo } from '../model/types';
import type { ImageExt, PickedImage } from '../platform/types';
import { PlatformError } from '../platform/types';
import { getPlatform } from '../platform';
import { MAX_IMAGE_BYTES, fitsImageLimits, megabytes, readImageSize, type ImageSize } from '../platform/limits';
import { sniffImageExt } from '../platform/paths';
import { putProjectAsset, readAsset } from '../storage';
import { decodeImage, disposeImage, hasImageDecoder, mimeForName } from './decode';
import { errorMessage } from './util';

export { MAX_IMAGE_BYTES as MAX_IMPORT_BYTES, readImageSize, type ImageSize } from '../platform/limits';
export { sniffImageExt as sniffImageType } from '../platform/paths';

export interface ImportFile {
  name: string;
  /**
   * The encoded image, or a file (a dropped File) that is read only when its
   * turn comes, and only when it is within the size limit.
   */
  data: Uint8Array | Blob;
}

export type ImportSkipReason = 'unsupported' | 'too-large' | 'unreadable' | 'failed';

export interface SkippedImport {
  name: string;
  reason: ImportSkipReason;
  message: string;
}

export interface ImportReport {
  /** Imported images, in input order. */
  assets: AssetInfo[];
  skipped: SkippedImport[];
}

// Bidi overrides and isolates can disguise a file name ("gpj.exe" tricks).
const UNSAFE_NAME_CHARS = /[\p{Cc}‪-‮⁦-⁩]/gu;

/** The file's own name (no folders, no control characters), at most 200 characters. */
function cleanName(raw: unknown, fallback: string): string {
  const base = typeof raw === 'string' ? (raw.split(/[\\/]/).pop() ?? '') : '';
  const cleaned = base.replace(UNSAFE_NAME_CHARS, '').trim();
  const chars = [...cleaned];
  return (chars.length > 200 ? chars.slice(0, 200).join('').trim() : cleaned) || fallback;
}

/** Decoded pixel size (honours EXIF rotation); the header size only where nothing can decode. */
async function measure({ bytes, type, header }: Admitted): Promise<ImageSize> {
  if (!hasImageDecoder()) return header;
  const img = await decodeImage(bytes, mimeForName(`image.${type}`));
  try {
    return { width: img.width, height: img.height };
  } finally {
    disposeImage(img);
  }
}

const UNSUPPORTED = 'Only PNG, JPEG and WebP images can be imported';
const tooLarge = (size: ImageSize) => `${size.width} x ${size.height} pixels is larger than supported`;
const tooManyBytes = () => `The file is larger than ${megabytes(MAX_IMAGE_BYTES)}`;

interface Skip {
  reason: ImportSkipReason;
  message: string;
}

interface Admitted {
  bytes: Uint8Array;
  type: ImageExt;
  /** Size from the header, already within the limits. */
  header: ImageSize;
}

/** Checks encoded bytes before any decode: type, byte size and the pixel size their header declares. */
function check(bytes: Uint8Array): Admitted | Skip {
  const type = sniffImageExt(bytes);
  if (!type) return { reason: 'unsupported', message: UNSUPPORTED };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { reason: 'too-large', message: tooManyBytes() };
  const header = readImageSize(bytes, type);
  if (!header) return { reason: 'unreadable', message: 'The image is damaged or uses a variant Wajha cannot read' };
  return fitsImageLimits(header) ? { bytes, type, header } : { reason: 'too-large', message: tooLarge(header) };
}

/** Reads (a file only when it is within the size limit) and checks one import. */
async function admit(data: unknown): Promise<Admitted | Skip> {
  if (data instanceof Uint8Array) return check(data);
  if (!(data instanceof Blob)) return { reason: 'unsupported', message: UNSUPPORTED };
  try {
    if (data.size > MAX_IMAGE_BYTES) {
      // Only the signature is read, so a large video says "unsupported" rather than "too large".
      const head = new Uint8Array(await data.slice(0, 16).arrayBuffer());
      return sniffImageExt(head) ? { reason: 'too-large', message: tooManyBytes() } : { reason: 'unsupported', message: UNSUPPORTED };
    }
    return check(new Uint8Array(await data.arrayBuffer()));
  } catch {
    // Folders, and files that went away since the drop.
    return { reason: 'unreadable', message: 'The file could not be read' };
  }
}

/** Like importImages, but also says which files were skipped and why. */
export async function importImagesWithReport(projectId: string, files: readonly ImportFile[]): Promise<ImportReport> {
  const assets: AssetInfo[] = [];
  const skipped: SkippedImport[] = [];
  const skip = (name: string, reason: ImportSkipReason, message: string) => skipped.push({ name, reason, message });

  for (const file of files) {
    const image = await admit(file?.data);
    const name = cleanName(file?.name, `image.${'type' in image ? image.type : 'png'}`);
    if (!('bytes' in image)) {
      skip(name, image.reason, image.message);
      continue;
    }
    let size: ImageSize;
    try {
      size = await measure(image);
    } catch (err) {
      skip(name, 'unreadable', errorMessage(err));
      continue;
    }
    if (!fitsImageLimits(size)) {
      skip(name, 'too-large', tooLarge(size));
      continue;
    }
    let id: string;
    try {
      id = await putProjectAsset(projectId, image.bytes, image.type);
    } catch (err) {
      skip(name, 'failed', errorMessage(err));
      continue;
    }
    assets.push({ id, name, width: size.width, height: size.height, bytes: image.bytes.byteLength, addedAt: Date.now() });
  }
  return { assets, skipped };
}

/** Stores files as project assets and returns their AssetInfo (with decoded pixel size). Skips non-images. */
export async function importImages(projectId: string, files: ImportFile[]): Promise<AssetInfo[]> {
  return (await importImagesWithReport(projectId, files)).assets;
}

/**
 * Like pickAndImportImages, but also says which picked files were skipped
 * and why. The platform has already stored every picked file; the refused
 * ones are left unreferenced, so the next prune deletes them.
 */
export async function pickAndImportImagesWithReport(projectId: string): Promise<ImportReport> {
  let picked: PickedImage[];
  try {
    picked = await getPlatform().pickImages(projectId);
  } catch (err) {
    if (err instanceof PlatformError && err.code === 'cancelled') return { assets: [], skipped: [] };
    throw err;
  }
  const assets: AssetInfo[] = [];
  const skipped: SkippedImport[] = [];
  // Read each stored file back to learn its decoded size.
  for (const item of picked) {
    const name = cleanName(item.name, item.assetId);
    try {
      const bytes = await readAsset(projectId, item.assetId);
      if (!bytes) {
        skipped.push({ name, reason: 'unreadable', message: 'The stored image could not be read back' });
        continue;
      }
      const image = check(bytes);
      if (!('bytes' in image)) {
        skipped.push({ name, reason: image.reason, message: image.message });
        continue;
      }
      const size = await measure(image);
      if (!fitsImageLimits(size)) {
        skipped.push({ name, reason: 'too-large', message: tooLarge(size) });
        continue;
      }
      assets.push({ id: item.assetId, name, width: size.width, height: size.height, bytes: bytes.byteLength, addedAt: Date.now() });
    } catch (err) {
      skipped.push({ name, reason: 'unreadable', message: errorMessage(err) });
    }
  }
  return { assets, skipped };
}

/** Opens the native picker and imports the chosen images. */
export async function pickAndImportImages(projectId: string): Promise<AssetInfo[]> {
  return (await pickAndImportImagesWithReport(projectId)).assets;
}
