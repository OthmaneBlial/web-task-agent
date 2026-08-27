import { Unzip, UnzipInflate, type UnzipFile } from "fflate";

export * from "../../packages/decision-receipt/src/index";

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 500;

function safeArchivePath(value: string): boolean {
  if (!value || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  const parts = value.split("/").filter((part, index, all) => !(index === all.length - 1 && part === ""));
  return parts.length > 0 && !parts.some((part) => !part || part === "." || part === "..");
}

function stripCommonRoot(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const entries = Object.entries(files);
  const roots = new Set(entries.map(([name]) => name.split("/")[0]));
  if (roots.size !== 1 || entries.some(([name]) => !name.includes("/"))) return files;
  return Object.fromEntries(entries.map(([name, value]) => [name.slice(name.indexOf("/") + 1), value]));
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/** Stream a ZIP with explicit file-count and expansion budgets before verification. */
export function unpackReceiptZip(input: ArrayBuffer | Uint8Array): Promise<Record<string, Uint8Array>> {
  const archive = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    return Promise.reject(new Error("ZIP exceeds the 25 MB compressed limit."));
  }

  return new Promise((resolve, reject) => {
    const output: Record<string, Uint8Array> = {};
    const active = new Set<UnzipFile>();
    let files = 0;
    let extracted = 0;
    let inputFinished = false;
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      for (const file of active) file.terminate?.();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const finish = (): void => {
      if (!settled && inputFinished && active.size === 0) {
        settled = true;
        resolve(stripCommonRoot(output));
      }
    };
    const unzip = new Unzip((file) => {
      if (settled) return;
      const directory = file.name.endsWith("/");
      if (!safeArchivePath(file.name)) {
        fail(new Error(`ZIP contains an unsafe path: ${file.name}.`));
        return;
      }
      if (!directory) {
        files += 1;
        if (files > MAX_FILES) {
          fail(new Error(`ZIP exceeds the ${MAX_FILES}-file limit.`));
          return;
        }
        if (file.originalSize !== undefined && file.originalSize > MAX_FILE_BYTES) {
          fail(new Error(`ZIP entry exceeds the 10 MB limit: ${file.name}.`));
          return;
        }
        if (file.originalSize !== undefined && extracted + file.originalSize > MAX_EXTRACTED_BYTES) {
          fail(new Error("ZIP exceeds the 50 MB extracted limit."));
          return;
        }
      }

      active.add(file);
      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          fail(error);
          return;
        }
        if (!directory && chunk.byteLength > 0) {
          fileBytes += chunk.byteLength;
          extracted += chunk.byteLength;
          if (fileBytes > MAX_FILE_BYTES || extracted > MAX_EXTRACTED_BYTES) {
            fail(new Error("ZIP expansion exceeds the local safety budget."));
            return;
          }
          chunks.push(chunk);
        }
        if (final) {
          active.delete(file);
          if (!directory) output[file.name] = joinChunks(chunks, fileBytes);
          finish();
        }
      };
      try {
        file.start();
      } catch (error) {
        fail(error);
      }
    });
    unzip.register(UnzipInflate);
    try {
      unzip.push(archive, true);
      inputFinished = true;
      finish();
    } catch (error) {
      fail(error);
    }
  });
}

export const receiptInputLimits = Object.freeze({
  maxArchiveBytes: MAX_ARCHIVE_BYTES,
  maxFileBytes: MAX_FILE_BYTES,
  maxExtractedBytes: MAX_EXTRACTED_BYTES,
  maxFiles: MAX_FILES
});
