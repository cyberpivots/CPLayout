import { Archive, Database, Download, FolderOpen, RefreshCw, Save, Trash2, Upload } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { exportScenarioGeoJson } from "../domain/geometry";
import {
  buildProjectArchiveBundle,
  exportProjectArchiveZip,
  importProjectArchiveZip,
} from "../domain/projectArchive";
import type { LayoutResult, PivotProject } from "../domain/types";
import { exportZipFileAsync, importZipFileAsync } from "../storage/projectArchiveIO";
import { projectRepository, type ProjectSummary } from "../storage/projectRepository";
import type { ProjectRepositoryBackendInfo } from "../storage/projectRepositoryTypes";

interface ProjectFilesPanelProps {
  project: PivotProject;
  result: LayoutResult;
  onProjectLoaded: (project: PivotProject) => void;
}

export function ProjectFilesPanel({ project, result, onProjectLoaded }: ProjectFilesPanelProps): React.JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState<string>(`Storage: ${projectRepository.backendLabel}`);
  const [backendInfo, setBackendInfo] = useState<ProjectRepositoryBackendInfo | null>(null);

  useEffect(() => {
    void refreshProjects();
  }, []);

  async function refreshProjects(): Promise<void> {
    try {
      const [projectList, info] = await Promise.all([
        projectRepository.listProjectsAsync(),
        projectRepository.getBackendInfoAsync(),
      ]);
      setProjects(projectList);
      setBackendInfo(info);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function saveCurrentProject(): Promise<void> {
    try {
      await projectRepository.saveProjectAsync(project, result);
      await refreshProjects();
      setStatus(`Saved ${project.name} with ${projectRepository.backendLabel}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function openProject(projectId: string): Promise<void> {
    try {
      const loaded = await projectRepository.loadProjectAsync(projectId);
      if (!loaded) {
        setStatus("Project was not found in local storage.");
        return;
      }
      onProjectLoaded(loaded);
      setStatus(`Opened ${loaded.name}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function deleteProject(projectId: string): Promise<void> {
    try {
      await projectRepository.deleteProjectAsync(projectId);
      await refreshProjects();
      setStatus("Deleted local project entry.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
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
      await projectRepository.saveProjectAsync(imported);
      await refreshProjects();
      setStatus(`Imported ${imported.name}.`);
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
        <FileAction icon={<Save size={18} color="#ffffff" />} label="Save Local" primary onPress={saveCurrentProject} />
        <FileAction icon={<Download size={18} color="#254234" />} label="Export ZIP" onPress={exportZip} />
        <FileAction icon={<Upload size={18} color="#254234" />} label="Import ZIP" onPress={importZip} />
        <FileAction icon={<RefreshCw size={18} color="#254234" />} label="Refresh" onPress={refreshProjects} />
      </View>
      <View style={styles.statusBox}>
        <Database size={17} color="#254234" />
        <Text style={styles.statusText}>{status}</Text>
      </View>
      {backendInfo && (
        <View style={styles.backendGrid}>
          <BackendTile label="Backend" value={backendInfo.backendLabel} />
          <BackendTile label="Runtime" value={backendInfo.runtime} />
          <BackendTile label="Schema" value={backendInfo.schemaVersion === undefined ? "n/a" : `v${backendInfo.schemaVersion}`} />
          <BackendTile label="Projects" value={`${backendInfo.projectCount ?? projects.length}`} />
        </View>
      )}
      {backendInfo?.notes.map((note) => (
        <Text key={note} style={styles.backendNote}>{note}</Text>
      ))}

      <View style={styles.projectList}>
        {projects.length === 0 ? (
          <Text style={styles.emptyText}>No local projects saved yet.</Text>
        ) : projects.map((summary) => (
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
