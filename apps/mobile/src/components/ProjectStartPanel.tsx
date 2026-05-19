import { MapPinned } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PivotProject } from "@cplayout/core";
import { useProjectRepository } from "../hooks/useProjectRepository";

interface ProjectStartPanelProps {
  onCreate: () => void;
  onOpen: (project: PivotProject) => void;
  onOpenSample: () => void;
}

export function ProjectStartPanel({ onCreate, onOpen, onOpenSample }: ProjectStartPanelProps): React.JSX.Element {
  const repository = useProjectRepository();

  async function open(projectId: string): Promise<void> {
    const project = await repository.openProject(projectId);
    if (project) onOpen(project);
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MapPinned size={20} color="#254234" />
        <Text style={styles.sectionTitle}>Projects</Text>
      </View>
      <View style={styles.projectActionRow}>
        <ActionButton label="Create New Layout" onPress={onCreate} selected />
        <ActionButton label="Open Sample" onPress={onOpenSample} />
        <ActionButton label="Refresh" onPress={() => void repository.refreshProjects()} />
      </View>
      <Text style={styles.rowMeta}>{repository.statusMessage}</Text>
      <View style={styles.projectList}>
        {repository.projects.length === 0 ? (
          <View style={styles.projectCard}>
            <Text style={styles.rowTitle}>No saved local projects yet</Text>
            <Text style={styles.rowMeta}>Create a layout or open the bundled sample, then save it from Export.</Text>
          </View>
        ) : repository.projects.map((project) => (
          <Pressable key={project.id} onPress={() => void open(project.id)} style={styles.projectCard}>
            <Text style={styles.rowTitle}>{project.name}</Text>
            <Text style={styles.rowMeta}>{project.projectCrs} · {project.unitSystem} · {project.updatedAt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ActionButton({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, selected && styles.actionButtonSelected]}>
      <Text style={[styles.actionText, selected && styles.actionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  sectionTitle: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  projectActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonSelected: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  actionText: {
    color: "#314339",
    fontSize: 13,
    fontWeight: "900",
  },
  actionTextSelected: {
    color: "#ffffff",
  },
  projectList: {
    gap: 10,
  },
  projectCard: {
    backgroundColor: "#f7faf5",
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  rowTitle: {
    color: "#1d2c22",
    fontSize: 15,
    fontWeight: "900",
  },
  rowMeta: {
    color: "#5b6b61",
    fontSize: 12,
    fontWeight: "700",
  },
});
