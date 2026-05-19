import { Archive, Database, Download, FolderOpen, RefreshCw, Save, Trash2, Upload } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { exportScenarioGeoJson } from "@cplayout/geometry";
import {
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  importProjectArchiveZip,
} from "@cplayout/project-store";
import type { LayoutResult, PivotProject } from "@cplayout/core";
import { exportZipFileAsync, importZipFileAsync } from "@cplayout/project-store";
import { useProjectRepository } from "../hooks/useProjectRepository";

interface ProjectFilesPanelProps {
  dirty: boolean;
  project: PivotProject;
  result: LayoutResult;
  onImportProjectedGeoJson: (geoJson: string) => void;
  onImportSurveyCsv: (csv: string) => void;
  onProjectLoaded: (project: PivotProject) => void;
  onSaved: () => void;
}

export function ProjectFilesPanel({
  dirty,
  project,
  result,
  onImportProjectedGeoJson,
  onImportSurveyCsv,
  onProjectLoaded,
  onSaved,
}: ProjectFilesPanelProps): React.JSX.Element {
  const repository = useProjectRepository();
  const [status, setStatus] = useState<string>("Project ZIP is the canonical project package.");
  const [geoJsonImport, setGeoJsonImport] = useState("");
  const [surveyCsvImport, setSurveyCsvImport] = useState("");

  async function saveCurrentProject(): Promise<void> {
    const saved = await repository.saveProject(project, result);
    if (saved) onSaved();
  }

  async function openProject(projectId: string): Promise<void> {
    const loaded = await repository.openProject(projectId);
    if (loaded) onProjectLoaded(loaded);
  }

  async function deleteProject(projectId: string): Promise<void> {
    await repository.deleteProject(projectId);
  }

  async function exportZip(): Promise<void> {
    try {
      const bundle = buildProjectArchiveBundle(project, result, exportScenarioGeoJson(project, result));
      const zip = exportProjectArchiveZip(bundle);
      const filename = `${project.id}.center-pivot.zip`;
      const outcome = await exportZipFileAsync(filename, zip);
      setStatus(outcome.message);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function importZip(): Promise<void> {
    try {
      const bytes = await importZipFileAsync();
      if (!bytes) {
        setStatus("No project package selected.");
        return;
      }
      const imported = importProjectArchiveZip(bytes);
      onProjectLoaded(imported);
      await repository.saveProject(imported);
      setStatus(`Imported ${imported.name}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function applyGeoJsonImport(): void {
    try {
      onImportProjectedGeoJson(geoJsonImport);
      setGeoJsonImport("");
      setStatus("Imported projected GeoJSON boundary/obstacles into the current project.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function applySurveyCsvImport(): void {
    try {
      onImportSurveyCsv(surveyCsvImport);
      setSurveyCsvImport("");
      setStatus("Imported survey CSV points into the current project.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Archive size={20} color="#254234" />
        <Text style={styles.title}>Project Files</Text>
      </View>
      <View style={styles.actionRow}>
        <FileAction icon={<Save size={18} color="#ffffff" />} label={dirty ? "Save Local *" : "Save Local"} primary onPress={saveCurrentProject} />
        <FileAction icon={<Download size={18} color="#254234" />} label="Export ZIP" onPress={exportZip} />
        <FileAction icon={<Upload size={18} color="#254234" />} label="Import ZIP" onPress={importZip} />
        <FileAction icon={<RefreshCw size={18} color="#254234" />} label="Refresh" onPress={repository.refreshProjects} />
      </View>
      <View style={styles.statusBox}>
        <Database size={17} color="#254234" />
        <Text style={styles.statusText}>{dirty ? "Unsaved edits. " : ""}{repository.statusMessage} · {status}</Text>
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

      <View style={styles.importGrid}>
        <View style={styles.importBox}>
          <Text style={styles.importTitle}>Projected GeoJSON Import</Text>
          <TextInput
            multiline
            onChangeText={setGeoJsonImport}
            placeholder="FeatureCollection with projectCrs and field_boundary/obstacle features"
            style={styles.importInput}
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
              <Pressable accessibilityLabel={`Open ${summary.name}`} onPress={() => openProject(summary.id)} style={styles.iconButton}>
                <FolderOpen size={18} color="#254234" />
              </Pressable>
              <Pressable accessibilityLabel={`Delete ${summary.name}`} onPress={() => deleteProject(summary.id)} style={styles.iconButtonDanger}>
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

function FileAction({ icon, label, onPress, primary = false }: { icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, primary && styles.actionButtonPrimary]}>
      {icon}
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Project file operation failed.";
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
  statusText: {
    color: "#254234",
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
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
