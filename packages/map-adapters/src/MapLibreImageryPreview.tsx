import React from "react";

import type { AppSettings, LayoutResult, PivotProject } from "@cplayout/core";

export interface MapLibreImageryPreviewProps {
  project: PivotProject;
  result: LayoutResult;
  settings: AppSettings;
  visible: boolean;
}

export function MapLibreImageryPreview(_props: MapLibreImageryPreviewProps): React.JSX.Element | null {
  return null;
}
