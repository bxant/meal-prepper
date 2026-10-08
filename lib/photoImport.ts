/**
 * Get a recipe photo from the camera or the photo library and shrink it to a
 * JPEG small enough for the OCR service (OCR.space's free tier: 1 MB).
 * Works in Expo Go. Nothing is uploaded here; see `lib/ocr.ts`.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { base64Bytes, OCR_SPACE_MAX_BYTES, OcrError, type RecipeImage } from './ocr';

export type PhotoSource = 'camera' | 'library';

/** Widest first; text stays legible at 1600 px for a page or a phone screenshot. */
const ATTEMPTS = [
  { width: 1600, compress: 0.7 },
  { width: 1200, compress: 0.55 },
  { width: 1000, compress: 0.45 },
];

async function shrink(uri: string, originalWidth: number): Promise<RecipeImage> {
  for (const { width, compress } of ATTEMPTS) {
    const context = ImageManipulator.manipulate(uri);
    if (originalWidth > width) context.resize({ width });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (saved.base64 && base64Bytes(saved.base64) <= OCR_SPACE_MAX_BYTES) {
      return { base64: saved.base64, mimeType: 'image/jpeg' };
    }
  }
  throw new OcrError('That image is too large to read. Try cropping it to just the ingredients.');
}

/** Resolves to null when the user cancels. */
export async function pickRecipePhoto(source: PhotoSource): Promise<RecipeImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new OcrError('Camera access is off. Allow it in your phone settings, or pick a saved photo.');
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Let the user crop to the ingredient list; less text means a better read.
    allowsEditing: true,
    quality: 1,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return shrink(asset.uri, asset.width);
}
