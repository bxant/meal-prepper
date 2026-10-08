import { base64Bytes, createOcrSpaceRecognizer, OcrError } from '../lib/ocr';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const image = { base64: 'aGVsbG8=', mimeType: 'image/jpeg' as const };

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('createOcrSpaceRecognizer', () => {
  it('sends the photo with the key in a header and joins the parsed text', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      json({ ParsedResults: [{ ParsedText: 'Pancakes\r\n2 cups flour' }, { ParsedText: '1 egg' }] })
    );
    globalThis.fetch = fetchMock;

    const text = await createOcrSpaceRecognizer(' my-key ').recognize(image);

    expect(text).toBe('Pancakes\n2 cups flour\n1 egg');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.ocr.space/parse/image');
    expect(init.headers).toEqual({ apikey: 'my-key' });
    const form = init.body as FormData;
    expect(form.get('base64Image')).toBe('data:image/jpeg;base64,aGVsbG8=');
    expect(form.get('OCREngine')).toBe('2');
  });

  it('needs a key and never calls out without one', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    await expect(createOcrSpaceRecognizer('').recognize(image)).rejects.toThrow(/Settings/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports processing errors, bad keys and network failures', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(json({ IsErroredOnProcessing: true, ErrorMessage: ['Unable to recognize the file type'] }));
    await expect(createOcrSpaceRecognizer('k').recognize(image)).rejects.toThrow(/Unable to recognize/);

    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(json({ error: 'E501: Not an image or PDF', details: 'Invalid base64 Data URI.' }, 400));
    await expect(createOcrSpaceRecognizer('k').recognize(image)).rejects.toThrow(/E501: Not an image/);

    globalThis.fetch = jest.fn().mockResolvedValue(json({ error: 'E555: API key not valid' }, 403));
    await expect(createOcrSpaceRecognizer('k').recognize(image)).rejects.toThrow(/API key/);

    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const error = await createOcrSpaceRecognizer('k').recognize(image).catch((e) => e);
    expect(error).toBeInstanceOf(OcrError);
  });

  it('refuses images over the free tier’s 1 MB limit before uploading', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    const big = { ...image, base64: 'A'.repeat(1.5 * 1024 * 1024) };
    await expect(createOcrSpaceRecognizer('k').recognize(big)).rejects.toThrow(/1 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('base64Bytes', () => {
  it('measures decoded size', () => {
    expect(base64Bytes('aGVsbG8=')).toBe(5);
    expect(base64Bytes('aGVsbG8h')).toBe(6);
  });
});
