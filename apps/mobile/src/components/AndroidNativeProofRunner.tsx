import React, { useEffect } from "react";
import { Platform } from "react-native";

import {
  ANDROID_NATIVE_IN_APP_PROOF_LOG_MARKER,
  runAndroidNativeProofRuntimeAsync,
} from "@cplayout/project-store";

let proofStarted = false;

export function AndroidNativeProofRunner({ enabled }: { enabled: boolean }): null {
  useEffect(() => {
    if (!enabled || proofStarted || Platform.OS !== "android") return;
    proofStarted = true;
    void runAndroidNativeProofRuntimeAsync()
      .then((payload) => {
        console.log(`${ANDROID_NATIVE_IN_APP_PROOF_LOG_MARKER} ${JSON.stringify(payload)}`);
      })
      .catch((error) => {
        console.log(`${ANDROID_NATIVE_IN_APP_PROOF_LOG_MARKER} ${JSON.stringify({
          status: "fail",
          error: error instanceof Error ? error.message : String(error),
        })}`);
      });
  }, [enabled]);

  return null;
}
