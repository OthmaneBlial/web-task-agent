import fs from "node:fs";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export function readBoundedTextFileSync(filePath: string, label: string): string {
  const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
    if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error(`${label} exceeds the 2 MB limit`);
    const buffer = Buffer.allocUnsafe(MAX_TEXT_FILE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > MAX_TEXT_FILE_BYTES) throw new Error(`${label} exceeds the 2 MB limit`);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}
