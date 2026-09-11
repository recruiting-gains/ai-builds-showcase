/** Local-only, bounded photo decoding. Nothing in this module sends a request. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const PHOTO_DECODE_MS = 12000;
export interface PhotoAsset {
  image: ImageBitmap;
  preview: string;
  name: string;
  dispose(): void;
}
export type PhotoDecoder = (file: File) => Promise<PhotoAsset>;

export function validatePhoto(file: Pick<File, 'size' | 'type' | 'name'>): void {
  if (!file.size) throw new Error('This photo is empty. Choose another picture.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Choose a photo smaller than 15 MB.');
  const known = /^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type);
  const unnamedType = !file.type && /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name);
  if (!known && !unnamedType) throw new Error('Choose a JPG, PNG, WebP, AVIF or supported iPhone photo.');
}

export async function decodePhoto(file: File): Promise<PhotoAsset> {
  validatePhoto(file);
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  // A timed-out decode can finish later; dispose it instead of replacing a newer photo.
  const work = (async () => {
    let original: ImageBitmap | null = null;
    let resized: ImageBitmap | null = null;
    let preview = '';
    try {
      original = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (expired) throw new Error('Photo loading timed out. Choose a smaller picture.');
      if (!original.width || !original.height || original.width * original.height > 50000000) {
        throw new Error('This photo is too large to display. Choose a smaller copy.');
      }
      const scale = Math.min(1, 1600 / Math.max(original.width, original.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(original.width * scale));
      canvas.height = Math.max(1, Math.round(original.height * scale));
      canvas.getContext('2d')!.drawImage(original, 0, 0, canvas.width, canvas.height);
      original.close(); original = null;
      resized = await createImageBitmap(canvas);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare the photo.')), 'image/jpeg', .82));
      if (expired) throw new Error('Photo loading timed out. Choose a smaller picture.');
      preview = URL.createObjectURL(blob);
      const image = resized; resized = null;
      let disposed = false;
      return { image, preview, name: file.name, dispose() { if (!disposed) { disposed = true; image.close(); URL.revokeObjectURL(preview); } } };
    } catch (error) {
      original?.close(); resized?.close(); if (preview) URL.revokeObjectURL(preview);
      if (error instanceof Error && /too large|timed out/.test(error.message)) throw error;
      throw new Error('This browser could not open that photo. Try a JPG or PNG.');
    }
  })();
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('Photo loading timed out. Try a smaller JPG or PNG.')); }, PHOTO_DECODE_MS); })]);
  } finally { clearTimeout(timer!); }
}

export class PhotoSlots {
  readonly slots: (PhotoAsset | null)[] = [null, null];
  private revisions = [0, 0];
  selected = 0;
  constructor(private decode: PhotoDecoder = decodePhoto) {}
  get current() { return this.slots[this.selected]; }
  get count() { return this.slots.filter(Boolean).length; }
  async load(index: number, file: File): Promise<boolean> {
    this.check(index); const revision = ++this.revisions[index];
    const asset = await this.decode(file);
    if (revision !== this.revisions[index]) { asset.dispose(); return false; }
    this.slots[index]?.dispose(); this.slots[index] = asset;
    if (!this.current) this.selected = index;
    return true;
  }
  select(index: number) { this.check(index); if (this.slots[index]) this.selected = index; }
  next() { if (this.count === 2) this.selected = 1 - this.selected; }
  remove(index: number) {
    this.check(index); ++this.revisions[index]; this.slots[index]?.dispose(); this.slots[index] = null;
    if (!this.current && this.slots[1 - index]) this.selected = 1 - index;
  }
  dispose() { this.remove(0); this.remove(1); }
  private check(index: number) { if (index !== 0 && index !== 1) throw new Error('Photo slot must be 1 or 2.'); }
}

/** Keep the complete picture visible; the hand surface supplies perspective and stretch. */
export function photoFit(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}
