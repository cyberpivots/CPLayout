export interface ArchiveIoResult {
  ok: boolean;
  message: string;
  uri?: string;
}

export async function exportZipFileAsync(filename: string, data: Uint8Array): Promise<ArchiveIoResult> {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return { ok: false, message: "Browser ZIP download is not available in this runtime." };
  }
  const bytes = data.slice();
  const blob = new Blob([bytes], { type: "application/zip" });
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

export async function importZipFileAsync(): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Could not read selected ZIP file."));
      reader.onload = () => {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("Selected ZIP file did not produce binary data."));
          return;
        }
        resolve(new Uint8Array(result));
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}
