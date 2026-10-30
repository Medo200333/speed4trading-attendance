export const FACE_PHOTO_LIMIT = 200 * 1024;
// Conservative application limits. They are not fabricated device capability values.
export const FACE_PHOTO_WIDTH = 480,
  FACE_PHOTO_HEIGHT = 640;
export function jpegDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 20 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new Error("الصورة ليست JPEG مكتملة. أعد اختيارها أو التقاطها.");
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) throw new Error("بنية JPEG غير صالحة.");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw new Error("بيانات الصورة ناقصة.");
    if ([192, 193, 194].includes(marker)) {
      if (length < 8) throw new Error("مقاسات الصورة ناقصة.");
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  throw new Error("تعذر قراءة أبعاد JPEG.");
}
export function validateFaceJpeg(bytes: Uint8Array) {
  if (bytes.length > FACE_PHOTO_LIMIT)
    throw new Error("حجم الصورة يتجاوز 200 كيلوبايت. أعد قصها وضغطها.");
  const size = jpegDimensions(bytes);
  if (
    size.width < 80 ||
    size.height < 80 ||
    size.width > 1920 ||
    size.height > 1920 ||
    size.width * size.height > 2000000
  )
    throw new Error(
      "أبعاد الصورة خارج حدود التطبيق الآمنة: من 80 إلى 1920 بكسل وبحد مليوني بكسل.",
    );
  return size;
}
