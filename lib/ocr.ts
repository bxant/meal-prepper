/**
 * Text recognition for photo recipe import, behind a small interface so an
 * on-device engine can replace the cloud one later without touching screens.
 *
 * Today's implementation is OCR.space (cloud). The photo is sent there only
 * when the user imports one, with the user's own API key from Settings;
 * nothing else is attached.
 */

export interface RecipeImage {
  /** JPEG/PNG bytes, base64-encoded. */
  base64: string;
  mimeType: 'image/jpeg' | 'image/png';
}

export interface TextRecognizer {
  /** Where the photo goes, for the UI ("OCR.space"). */
  label: string;
  /** Plain text, lines separated by "\n". */
  recognize(image: RecipeImage): Promise<string>;
}

export class OcrError extends Error {}

const OCR_SPACE_URL = 'https://api.ocr.space/parse/image';
const TIMEOUT_MS = 60000;
/** OCR.space's free tier rejects files over 1 MB. */
export const OCR_SPACE_MAX_BYTES = 1024 * 1024;

export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

interface OcrSpaceResponse {
  ParsedResults?: { ParsedText?: string }[];
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
}

export function createOcrSpaceRecognizer(apiKey: string): TextRecognizer {
  return {
    label: 'OCR.space',
    async recognize(image) {
      if (apiKey.trim() === '') throw new OcrError('Add your OCR.space API key in Settings first.');
      if (base64Bytes(image.base64) > OCR_SPACE_MAX_BYTES) {
        throw new OcrError('That image is too large for OCR.space (1 MB limit). Try cropping it.');
      }
      const form = new FormData();
      form.append('base64Image', `data:${image.mimeType};base64,${image.base64}`);
      form.append('language', 'eng');
      // Engine 2 handles photos of printed pages and screenshots better.
      form.append('OCREngine', '2');
      form.append('scale', 'true');
      form.append('detectOrientation', 'true');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(OCR_SPACE_URL, {
          method: 'POST',
          headers: { apikey: apiKey.trim() },
          body: form,
          signal: controller.signal,
        });
      } catch {
        throw new OcrError("Couldn't reach OCR.space. Check your connection and try again.");
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 401 || response.status === 403) {
        throw new OcrError('OCR.space rejected the API key. Check it in Settings.');
      }
      if (!response.ok) {
        // e.g. 400 {"error":"E501: Not an image or PDF","details":"Invalid base64 Data URI."}
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new OcrError(
          body?.error
            ? `OCR.space couldn't read the image: ${body.error}`
            : `OCR.space returned an error (${response.status}). Try again later.`
        );
      }
      let json: OcrSpaceResponse;
      try {
        json = (await response.json()) as OcrSpaceResponse;
      } catch {
        throw new OcrError('OCR.space sent an unreadable response. Try again.');
      }
      if (json.IsErroredOnProcessing) {
        const message = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(' ') : json.ErrorMessage;
        throw new OcrError(`OCR.space couldn't read the image${message ? `: ${message}` : '.'}`);
      }
      return (json.ParsedResults ?? [])
        .map((result) => result.ParsedText ?? '')
        .join('\n')
        .replace(/\r\n/g, '\n');
    },
  };
}
