import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { ArchiveIoResult, ExportFileOptions, ImportFileOptions, PickedFileResult } from "./projectArchiveIO";

export interface NativeExportFileOptions extends ExportFileOptions {
  dialogTitle?: string;
  UTI?: string;
}

export async function exportFileAsync(
  filename: string,
  data: Uint8Array | string,
  options: NativeExportFileOptions = {},
): Promise<ArchiveIoResult> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(data);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return { ok: true, message: `Saved ${filename} to the app cache.`, uri: file.uri };
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: options.dialogTitle ?? "Export center pivot file",
    mimeType: options.mimeType ?? "application/octet-stream",
    UTI: options.UTI,
  });
  return { ok: true, message: `Shared ${filename}.`, uri: file.uri };
}

export async function exportZipFileAsync(filename: string, data: Uint8Array): Promise<ArchiveIoResult> {
  return exportFileAsync(filename, data, {
    dialogTitle: "Export center pivot project package",
    mimeType: "application/zip",
    UTI: "com.pkware.zip-archive",
  });
}

export async function importFileAsync(options: ImportFileOptions): Promise<PickedFileResult | null> {
  const picked = await File.pickFileAsync(undefined, mimeTypeFromAccept(options.accept));
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file) return null;
  return {
    filename: filenameFromUri(file.uri),
    bytes: await file.bytes(),
    mimeType: file.type || undefined,
  };
}

export async function importZipFileAsync(): Promise<Uint8Array | null> {
  const file = await importFileAsync({ accept: ".zip,application/zip", errorLabel: "ZIP" });
  return file?.bytes ?? null;
}

function mimeTypeFromAccept(accept: string): string {
  if (accept.includes("application/zip")) return "application/zip";
  if (accept.includes("google-earth")) return "*/*";
  if (accept.includes("application/vnd.google-earth.kmz")) return "application/vnd.google-earth.kmz";
  if (accept.includes("application/vnd.google-earth.kml+xml")) return "application/vnd.google-earth.kml+xml";
  return "*/*";
}

function filenameFromUri(uri: string): string {
  const cleanUri = uri.split("?")[0];
  const filename = cleanUri.split("/").filter(Boolean).at(-1);
  return filename ? decodeURIComponent(filename) : "selected-file";
}
