import fs from "node:fs";

const DEFAULT_MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

function describeByteLimit(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KB`;
  return `${bytes} bytes`;
}

export function readBoundedTextFileSync(
  filePath: string,
  label: string,
  maxBytes = DEFAULT_MAX_TEXT_FILE_BYTES
): string {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
    if (stat.size > maxBytes) throw new Error(`${label} exceeds the ${describeByteLimit(maxBytes)} limit`);
    const buffer = Buffer.allocUnsafe(stat.size + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead !== stat.size) throw new Error(`${label} changed while reading`);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}
