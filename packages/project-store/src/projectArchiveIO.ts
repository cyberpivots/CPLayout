export interface ArchiveIoResult {
  ok: boolean;
  message: string;
  uri?: string;
}

export interface PickedFileResult {
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
}

export interface ExportFileOptions {
  mimeType?: string;
}

export interface ImportFileOptions {
  accept: string;
  errorLabel: string;
}

export async function exportFileAsync(
  filename: string,
  data: Uint8Array | string,
  options: ExportFileOptions = {},
): Promise<ArchiveIoResult> {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return { ok: false, message: "Browser file download is not available in this runtime." };
  }
  const blobPart = typeof data === "string" ? data : copyArrayBuffer(data);
  const blob = new Blob([blobPart], { type: options.mimeType ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { ok: true, message: `Downloaded ${filename}.`, uri: filename };
}

function copyArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export async function exportZipFileAsync(filename: string, data: Uint8Array): Promise<ArchiveIoResult> {
  return exportFileAsync(filename, data.slice(), { mimeType: "application/zip" });
}

export async function importFileAsync(options: ImportFileOptions): Promise<PickedFileResult | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error(`Could not read selected ${options.errorLabel} file.`));
      reader.onload = () => {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error(`Selected ${options.errorLabel} file did not produce binary data.`));
          return;
        }
        resolve({ filename: file.name, bytes: new Uint8Array(result), mimeType: file.type });
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}

export async function importZipFileAsync(): Promise<Uint8Array | null> {
  const file = await importFileAsync({ accept: ".zip,application/zip", errorLabel: "ZIP" });
  return file?.bytes ?? null;
}
