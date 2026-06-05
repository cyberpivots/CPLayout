export async function runAndroidNativeProofRuntimeAsync(): Promise<unknown> {
  return {
    status: "blocked",
    reason: "Android native proof runtime is only available in the native Android bundle.",
  };
}
