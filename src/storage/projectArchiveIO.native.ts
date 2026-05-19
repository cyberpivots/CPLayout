import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { ArchiveIoResult } from "./projectArchiveIO";

export async function exportZipFileAsync(filename: string, data: Uint8Array): Promise<ArchiveIoResult> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(data);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return { ok: true, message: `Saved ${filename} to the app cache.`, uri: file.uri };
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: "Export center pivot project package",
    mimeType: "application/zip",
    UTI: "com.pkware.zip-archive",
  });
  return { ok: true, message: `Shared ${filename}.`, uri: file.uri };
}

export async function importZipFileAsync(): Promise<Uint8Array | null> {
  const picked = await File.pickFileAsync(undefined, "application/zip");
  const file = Array.isArray(picked) ? picked[0] : picked;
  return file ? file.bytes() : null;
}
