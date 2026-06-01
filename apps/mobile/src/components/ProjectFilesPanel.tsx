import { Archive, Database, Download, FolderOpen, RefreshCw, Save, Trash2, Upload } from "lucide-react-native";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { exportScenarioGeoJson } from "@cplayout/geometry";
import {
  buildProjectArchiveBundle,
  createGoogleEarthKmz,
  exportFileAsync,
  exportProjectArchiveZip,
  exportZipFileAsync,
  importProjectArchiveZip,
  importFileAsync,
  importZipFileAsync,
  readGoogleEarthKmlFile,
} from "@cplayout/project-store";
import { exportProjectGoogleEarthKml, type GoogleEarthKmlImportResult, type LayoutResult, type PivotProject } from "@cplayout/core";
import type { ProjectWorkspaceStatus } from "../hooks/useProjectRepository";
import { GoogleEarthImportWizard } from "./GoogleEarthImportWizard";

interface ProjectFilesPanelProps {
  dirty: boolean;
  project: PivotProject;
  result: LayoutResult;
  repository: ProjectWorkspaceStatus;
  onImportProjectedGeoJson: (geoJson: string) => string;
  onImportSurveyCsv: (csv: string) => string;
  onPreviewGoogleEarthKml: (kmlText: string, selectedItemIds?: string[]) => GoogleEarthKmlImportResult;
  onApplyGoogleEarthKmlImport: (project: PivotProject) => void;
  onProjectLoaded: (project: PivotProject) => void;
  onSaveProject: () => void | Promise<void>;
  onOpenProject: (projectId: string) => void | Promise<void>;
  onDeleteProject: (projectId: string) => Promise<boolean>;
  onRefreshProjects: () => Promise<void>;
}

type StatusTone = "info" | "success" | "warning" | "error";

interface PanelStatus {
  tone: StatusTone;
  text: string;
}

interface PendingKmlImport {
  filename: string;
  kind: "kml" | "kmz";
  kmlText: string;
  result: GoogleEarthKmlImportResult;
  archiveWarnings: string[];
}

export function ProjectFilesPanel({
  dirty,
  project,
  result,
  repository,
  onImportProjectedGeoJson,
  onImportSurveyCsv,
  onPreviewGoogleEarthKml,
  onApplyGoogleEarthKmlImport,
  onProjectLoaded,
  onSaveProject,
  onOpenProject,
  onDeleteProject,
  onRefreshProjects,
}: ProjectFilesPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<PanelStatus>({ tone: "info", text: "Project ZIP is the canonical project package." });
  const [pendingKmlImport, setPendingKmlImport] = useState<PendingKmlImport | null>(null);
  const [selectedKmlReviewItemIds, setSelectedKmlReviewItemIds] = useState<string[]>([]);
  const [geoJsonImport, setGeoJsonImport] = useState("");
  const [surveyCsvImport, setSurveyCsvImport] = useState("");

  async function exportZip(): Promise<void> {
    try {
      const bundle = buildProjectArchiveBundle(project, result, exportScenarioGeoJson(project, result));
      const zip = exportProjectArchiveZip(bundle);
      const filename = `${project.id}.center-pivot.zip`;
      const outcome = await exportZipFileAsync(filename, zip);
      setStatus({ tone: outcome.ok ? "success" : "error", text: outcome.message });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  async function exportKml(): Promise<void> {
    try {
      const exported = exportProjectGoogleEarthKml(project, result);
      const filename = `${project.id}.google-earth.kml`;
      const outcome = await exportFileAsync(filename, exported.kml, { mimeType: "application/vnd.google-earth.kml+xml" });
      setStatus({
        tone: outcome.ok ? "success" : "error",
        text: `${outcome.message} Exported ${exported.exportedFeatureCount} Google Earth feature${exported.exportedFeatureCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  async function exportKmz(): Promise<void> {
    try {
      const exported = exportProjectGoogleEarthKml(project, result);
      const filename = `${project.id}.google-earth.kmz`;
      const outcome = await exportFileAsync(filename, createGoogleEarthKmz(exported.kml), {
        mimeType: "application/vnd.google-earth.kmz",
      });
      setStatus({
        tone: outcome.ok ? "success" : "error",
        text: `${outcome.message} KMZ contains doc.kml with ${exported.exportedFeatureCount} feature${exported.exportedFeatureCount === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  async function importZip(): Promise<void> {
    try {
      const bytes = await importZipFileAsync();
      if (!bytes) {
        setStatus({ tone: "info", text: "No project package selected." });
        return;
      }
      const imported = importProjectArchiveZip(bytes);
      onProjectLoaded(imported);
      const saved = await repository.saveProject(imported);
      setStatus({ tone: saved ? "success" : "warning", text: saved ? `Imported ${imported.name}.` : `Opened ${imported.name}, but it was not saved locally.` });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  async function importKmlOrKmz(): Promise<void> {
    try {
      const file = await importFileAsync({
        accept: ".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/xml,text/xml",
        errorLabel: "KML/KMZ",
      });
      if (!file) {
        setStatus({ tone: "info", text: "No Google Earth file selected." });
        return;
      }
      const googleEarthFile = readGoogleEarthKmlFile(file);
      const result = onPreviewGoogleEarthKml(googleEarthFile.kmlText);
      setPendingKmlImport({
        filename: googleEarthFile.filename,
        kind: googleEarthFile.kind,
        kmlText: googleEarthFile.kmlText,
        result,
        archiveWarnings: googleEarthFile.warnings,
      });
      setSelectedKmlReviewItemIds(result.items.filter((item) => item.selected).map((item) => item.id));
      const tone: StatusTone = result.warnings.length > 0 || googleEarthFile.warnings.length > 0 ? "warning" : "info";
      setStatus({
        tone,
        text: `${googleEarthFile.filename} is ready for review. ${kmlImportSummary(result)}${formatWarnings([...googleEarthFile.warnings, ...result.warnings])}`,
      });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  function applyGeoJsonImport(): void {
    try {
      const message = onImportProjectedGeoJson(geoJsonImport);
      setGeoJsonImport("");
      setStatus({ tone: "success", text: message });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  function applySurveyCsvImport(): void {
    try {
      const message = onImportSurveyCsv(surveyCsvImport);
      setSurveyCsvImport("");
      setStatus({ tone: "success", text: message });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    }
  }

  function applyPendingKmlImport(): void {
    if (!pendingKmlImport) return;
    const selectedResult = onPreviewGoogleEarthKml(pendingKmlImport.kmlText, selectedKmlReviewItemIds);
    onApplyGoogleEarthKmlImport(selectedResult.project);
    setStatus({
      tone: "success",
      text: `Applied ${pendingKmlImport.filename}. ${kmlImportSummary(selectedResult)}`,
    });
    setPendingKmlImport(null);
    setSelectedKmlReviewItemIds([]);
  }

  function cancelPendingKmlImport(): void {
    setPendingKmlImport(null);
    setSelectedKmlReviewItemIds([]);
    setStatus({ tone: "info", text: "Canceled Google Earth import review." });
  }

  function toggleKmlReviewItem(itemId: string): void {
    setSelectedKmlReviewItemIds((current) =>
      current.includes(itemId)
        ? current.filter((candidate) => candidate !== itemId)
        : [...current, itemId],
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Archive size={20} color="#254234" />
        <Text style={styles.title}>Project Files</Text>
      </View>
      <Text style={styles.groupTitle}>Canonical Project Package</Text>
      <View style={styles.actionRow}>
        <FileAction icon={<Save size={18} color="#ffffff" />} label={dirty ? "Save Local *" : "Save Local"} primary onPress={onSaveProject} />
        <FileAction icon={<Download size={18} color="#254234" />} label="Export ZIP" onPress={exportZip} />
        <FileAction icon={<Upload size={18} color="#254234" />} label="Import ZIP" onPress={importZip} />
        <FileAction icon={<RefreshCw size={18} color="#254234" />} label="Refresh" onPress={onRefreshProjects} />
      </View>
      <View style={[styles.statusBox, statusToneStyle(status.tone)]} testID="files-status" {...webStatusProps()}>
        <Database size={17} color={statusToneColor(status.tone)} />
        <Text style={[styles.statusText, statusTextToneStyle(status.tone)]}>{dirty ? "Unsaved edits. " : ""}{repository.statusMessage} · {status.text}</Text>
      </View>
      {repository.backendInfo && (
        <View style={styles.backendGrid}>
          <BackendTile label="Backend" value={repository.backendInfo.backendLabel} />
          <BackendTile label="Runtime" value={repository.backendInfo.runtime} />
          <BackendTile label="Schema" value={repository.backendInfo.schemaVersion === undefined ? "n/a" : `v${repository.backendInfo.schemaVersion}`} />
          <BackendTile label="Projects" value={`${repository.backendInfo.projectCount ?? repository.projects.length}`} />
        </View>
      )}
      {repository.backendInfo?.notes.map((note) => (
        <Text key={note} style={styles.backendNote}>{note}</Text>
      ))}

      <Text style={styles.groupTitle}>GIS Exchange</Text>
      <View style={styles.gisExchangeGrid}>
        <View style={styles.gisActionBox}>
          <View style={styles.actionRow}>
            <FileAction icon={<Upload size={18} color="#254234" />} label="Import KML/KMZ" onPress={importKmlOrKmz} />
            <FileAction icon={<Download size={18} color="#254234" />} label="Export KML" onPress={exportKml} />
            <FileAction icon={<Download size={18} color="#254234" />} label="Export KMZ" onPress={exportKmz} />
          </View>
        </View>
        <GoogleEarthImportWizard />
      </View>
      {pendingKmlImport ? (
        <View style={styles.reviewBox}>
          <View>
            <Text style={styles.importTitle}>Review {pendingKmlImport.kind.toUpperCase()} Import</Text>
            <Text style={styles.reviewText}>
              {pendingKmlImport.filename} · {kmlImportSummary(pendingKmlImport.result)}
            </Text>
            <View style={styles.reviewItemGrid}>
              {kmlReviewItems(pendingKmlImport.result).map((item) => {
                const selected = selectedKmlReviewItemIds.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => toggleKmlReviewItem(item.id)}
                    style={[styles.reviewItem, selected && styles.reviewItemSelected]}
                  >
                    <Text style={[styles.reviewItemTitle, selected && styles.reviewItemTitleSelected]}>{item.title}</Text>
                    <Text style={[styles.reviewItemMeta, selected && styles.reviewItemMetaSelected]}>{item.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
            {pendingKmlImport.result.importedBoundary ? (
              <Text style={styles.reviewWarning}>Existing field boundary will be replaced after projection into {project.projectCrs}.</Text>
            ) : null}
            {pendingKmlImport.result.warnings.map((warning) => (
              <Text key={warning} style={styles.reviewWarning}>{warning}</Text>
            ))}
            {pendingKmlImport.archiveWarnings.map((warning) => (
              <Text key={warning} style={styles.reviewWarning}>{warning}</Text>
            ))}
          </View>
          <View style={styles.actionRow}>
            <FileAction icon={<Upload size={18} color="#ffffff" />} label="Apply Import" primary onPress={applyPendingKmlImport} />
            <FileAction icon={<Trash2 size={18} color="#254234" />} label="Cancel" onPress={cancelPendingKmlImport} />
          </View>
        </View>
      ) : null}

      <View style={styles.importGrid}>
        <View style={styles.importBox}>
          <Text style={styles.importTitle}>Projected GeoJSON Import</Text>
          <TextInput
            multiline
            onChangeText={setGeoJsonImport}
            placeholder="FeatureCollection with projectCrs and field_boundary/obstacle features"
            style={styles.importInput}
            testID="files-geojson-import-input"
            value={geoJsonImport}
          />
          <FileAction icon={<Upload size={18} color="#254234" />} label="Import GeoJSON" onPress={applyGeoJsonImport} />
        </View>
        <View style={styles.importBox}>
          <Text style={styles.importTitle}>Survey CSV Import</Text>
          <TextInput
            multiline
            onChangeText={setSurveyCsvImport}
            placeholder="id,label,role,x,y,source,confidence"
            style={styles.importInput}
            testID="files-survey-csv-import-input"
            value={surveyCsvImport}
          />
          <FileAction icon={<Upload size={18} color="#254234" />} label="Import CSV" onPress={applySurveyCsvImport} />
        </View>
      </View>

      <View style={styles.projectList}>
        {repository.projects.length === 0 ? (
          <Text style={styles.emptyText}>No local projects saved yet.</Text>
        ) : repository.projects.map((summary) => (
          <View key={summary.id} style={styles.projectRow}>
            <View style={styles.projectMeta}>
              <Text style={styles.projectName}>{summary.name}</Text>
              <Text style={styles.projectDetail}>{summary.projectCrs} · {summary.unitSystem.replaceAll("_", " ")} · {new Date(summary.updatedAt).toLocaleString()}</Text>
            </View>
            <View style={styles.rowActions}>
              <Pressable accessibilityLabel={`Open ${summary.name}`} onPress={() => void onOpenProject(summary.id)} style={styles.iconButton}>
                <FolderOpen size={18} color="#254234" />
              </Pressable>
              <Pressable accessibilityLabel={`Delete ${summary.name}`} onPress={() => void onDeleteProject(summary.id)} style={styles.iconButtonDanger}>
                <Trash2 size={18} color="#8b1e18" />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function BackendTile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.backendTile}>
      <Text style={styles.backendLabel}>{label}</Text>
      <Text style={styles.backendValue}>{value}</Text>
    </View>
  );
}

function FileAction({ icon, label, onPress, primary = false }: { icon: React.ReactNode; label: string; onPress: () => void | Promise<void>; primary?: boolean }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.actionButton, primary && styles.actionButtonPrimary]}>
      {icon}
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function webStatusProps(): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    "aria-live": "polite",
    role: "status",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project file operation failed.";
}

function kmlImportSummary(result: GoogleEarthKmlImportResult): string {
  const parts = [
    result.importedBoundary ? "1 boundary" : "no boundary",
    `${result.importedObstacleCount} obstacle${result.importedObstacleCount === 1 ? "" : "s"}`,
    `${result.importedSurveyPointCount} point${result.importedSurveyPointCount === 1 ? "" : "s"}`,
  ];
  if (result.importedMapFeatureCount > 0) parts.push(`${result.importedMapFeatureCount} map feature${result.importedMapFeatureCount === 1 ? "" : "s"}`);
  if (result.skippedFeatureCount > 0) parts.push(`${result.skippedFeatureCount} skipped`);
  return parts.join(", ");
}

function kmlReviewItems(result: GoogleEarthKmlImportResult): { id: string; title: string; detail: string }[] {
  const items = result.items.map((item) => ({
    id: item.id,
    title: item.name,
    detail: `${item.classification.replaceAll("_", " ")} · ${item.geometryType}${item.warning ? ` · ${item.warning}` : ""}`,
  }));
  return items.length > 0
    ? items
    : [{
      id: "none",
      title: "No imported project geometry",
      detail: "The parser did not return selectable boundary, obstacle, survey, or map-feature candidates.",
    }];
}

function formatWarnings(warnings: string[]): string {
  const uniqueWarnings = [...new Set(warnings)];
  return uniqueWarnings.length > 0 ? ` Warnings: ${uniqueWarnings.join(" ")}` : "";
}

function statusToneColor(tone: StatusTone): string {
  if (tone === "error") return "#8b1e18";
  if (tone === "warning") return "#805116";
  if (tone === "success") return "#1f5f39";
  return "#254234";
}

function statusToneStyle(tone: StatusTone) {
  if (tone === "error") return styles.statusError;
  if (tone === "warning") return styles.statusWarning;
  if (tone === "success") return styles.statusSuccess;
  return styles.statusInfo;
}

function statusTextToneStyle(tone: StatusTone) {
  if (tone === "error") return styles.statusTextError;
  if (tone === "warning") return styles.statusTextWarning;
  if (tone === "success") return styles.statusTextSuccess;
  return styles.statusTextInfo;
}

const styles = StyleSheet.create({
  panel: {
    gap: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  groupTitle: {
    color: "#405146",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonPrimary: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  actionText: {
    color: "#254234",
    fontSize: 13,
    fontWeight: "900",
  },
  actionTextPrimary: {
    color: "#ffffff",
  },
  statusBox: {
    alignItems: "flex-start",
    backgroundColor: "#eef4ed",
    borderColor: "#bed0bd",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  statusInfo: {
    backgroundColor: "#eef4ed",
    borderColor: "#bed0bd",
  },
  statusSuccess: {
    backgroundColor: "#edf8ef",
    borderColor: "#a8d3b5",
  },
  statusWarning: {
    backgroundColor: "#fff7e7",
    borderColor: "#e0bf79",
  },
  statusError: {
    backgroundColor: "#fff0ee",
    borderColor: "#dfa59d",
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  statusTextInfo: {
    color: "#254234",
  },
  statusTextSuccess: {
    color: "#1f5f39",
  },
  statusTextWarning: {
    color: "#805116",
  },
  statusTextError: {
    color: "#8b1e18",
  },
  backendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  backendTile: {
    backgroundColor: "#f8faf4",
    borderColor: "#d8e0d4",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 128,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  backendLabel: {
    color: "#5a6c60",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  backendValue: {
    color: "#21382b",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
  },
  backendNote: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  importGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gisExchangeGrid: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gisActionBox: {
    flexBasis: 280,
    flexGrow: 1,
  },
  importBox: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 320,
    flexGrow: 1,
    gap: 9,
    padding: 12,
  },
  importTitle: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
  },
  reviewBox: {
    borderColor: "#e0bf79",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  reviewText: {
    color: "#26372c",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 4,
  },
  reviewItemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  reviewItem: {
    backgroundColor: "#f8faf4",
    borderColor: "#d4decf",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 190,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  reviewItemSelected: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  reviewItemTitle: {
    color: "#26372c",
    fontSize: 13,
    fontWeight: "900",
  },
  reviewItemTitleSelected: {
    color: "#ffffff",
  },
  reviewItemMeta: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 3,
  },
  reviewItemMetaSelected: {
    color: "#e9f1e7",
  },
  reviewWarning: {
    color: "#805116",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 4,
  },
  importInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1d2c22",
    fontFamily: "monospace",
    fontSize: 12,
    minHeight: 96,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  projectList: {
    gap: 9,
  },
  emptyText: {
    color: "#5b6b61",
    fontSize: 13,
    fontWeight: "800",
  },
  projectRow: {
    alignItems: "center",
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    padding: 12,
  },
  projectMeta: {
    flex: 1,
    minWidth: 220,
  },
  projectName: {
    color: "#1d2c22",
    fontSize: 15,
    fontWeight: "900",
  },
  projectDetail: {
    color: "#5b6b61",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#edf4eb",
    borderColor: "#c4d4c3",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  iconButtonDanger: {
    alignItems: "center",
    backgroundColor: "#fff0ee",
    borderColor: "#e2aaa4",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
});
