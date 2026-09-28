export async function cancelResponseBody(body: ReadableStream<Uint8Array> | null | undefined): Promise<void> {
  await body?.cancel().catch(() => undefined);
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  label: string
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(label + " response exceeded " + maxBytes + " bytes");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
