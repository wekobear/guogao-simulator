/**
 * 本地选图：仅本机展示，不参与评分、不上传、不持久化。
 * JPEG / PNG / WebP，单张 ≤ 8 MiB，解码后 ≤ 2000 万像素。
 */

export type PickedImage = {
  url: string;
  width: number;
  height: number;
};

export type ImageErrorCode = 'empty' | 'size' | 'type' | 'decode' | 'pixels';

export class ImageError extends Error {
  code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ImageError';
  }
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const PREVIEW_MAX_EDGE = 1600;

/** 魔数嗅探实际类型；accept 属性只是提示，以内容为准 */
function sniffType(header: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'jpeg';
  }
  if (
    header.length >= 4 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return 'png';
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export async function pickImage(file: File): Promise<PickedImage> {
  if (file.size === 0) {
    throw new ImageError('empty', '这个文件是空的，请换一张图片。');
  }
  if (file.size > MAX_BYTES) {
    throw new ImageError(
      'size',
      `图片超过 8 MiB（当前 ${(file.size / 1024 / 1024).toFixed(1)} MiB），请压缩后再试。`,
    );
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sniffed = sniffType(header);
  if (!sniffed) {
    throw new ImageError(
      'type',
      '不支持的图片格式。仅支持 JPEG、PNG、WebP；SVG、GIF、HEIC 等请先转换。',
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError('decode', '这张图片无法解码，可能已损坏。请换一张试试。');
  }
  const pixels = bitmap.width * bitmap.height;
  if (pixels > MAX_PIXELS) {
    bitmap.close();
    throw new ImageError(
      'pixels',
      `图片像素超过 2000 万（当前 ${pixels.toLocaleString('zh-CN')}），请缩小后再试。`,
    );
  }
  // 预览最长边缩到 1600px，减少内存占用；展示效果不受影响
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new ImageError('decode', '当前浏览器无法处理这张图片。');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), sniffed === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  });
  if (!blob) {
    throw new ImageError('decode', '生成预览失败，请换一张试试。');
  }
  return { url: URL.createObjectURL(blob), width, height };
}

export function revokeImage(url: string | null): void {
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* 忽略 */
    }
  }
}
