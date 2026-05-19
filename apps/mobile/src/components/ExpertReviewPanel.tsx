import { AlertTriangle, ClipboardList, Database, MapPinned, Satellite } from "lucide-react-native";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { buildExpertReviewFindings, type AppSettings, type ExpertReviewFinding, type LayoutResult, type PivotProject } from "@cplayout/core";

interface ExpertReviewPanelProps {
  project: PivotProject;
  result: LayoutResult;
  settings: AppSettings;
}

export function ExpertReviewPanel({ project, result, settings }: ExpertReviewPanelProps): React.JSX.Element {
  const findings = useMemo(
    () => buildExpertReviewFindings(project, result, settings),
    [project, result, settings],
  );

  return (
    <View style={styles.shell}>
      {findings.map((finding) => (
        <View key={finding.role} style={styles.finding}>
          <View style={styles.findingHeader}>
            <View style={styles.roleTitle}>
              {roleIcon(finding)}
              <View>
                <Text style={styles.role}>{finding.role}</Text>
                <Text style={styles.headline}>{finding.headline}</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, statusStyle(finding.status)]}>
              <Text style={[styles.statusText, statusTextStyle(finding.status)]}>{finding.status}</Text>
            </View>
          </View>
          <Text style={styles.findingText}>{finding.finding}</Text>
          <View style={styles.evidenceList}>
            {finding.evidence.map((evidence) => (
              <Text key={evidence} style={styles.evidence}>- {evidence}</Text>
            ))}
          </View>
          <Text style={styles.gate}>{finding.acceptanceGate}</Text>
        </View>
      ))}
    </View>
  );
}

function roleIcon(finding: ExpertReviewFinding): React.JSX.Element {
  const color = finding.status === "blocked" ? "#8b1e18" : finding.status === "watch" ? "#805116" : "#254234";
  switch (finding.role) {
    case "Product/UX":
      return <ClipboardList size={21} color={color} />;
    case "GIS/Mapping":
      return <MapPinned size={21} color={color} />;
    case "Architecture/Storage":
      return <Database size={21} color={color} />;
    case "ML Feasibility":
      return <Satellite size={21} color={color} />;
    case "QA/Safety":
      return <AlertTriangle size={21} color={color} />;
  }
}

function statusStyle(status: ExpertReviewFinding["status"]) {
  if (status === "blocked") return styles.statusBlocked;
  if (status === "watch") return styles.statusWatch;
  return styles.statusPass;
}

function statusTextStyle(status: ExpertReviewFinding["status"]) {
  if (status === "blocked") return styles.statusTextBlocked;
  if (status === "watch") return styles.statusTextWatch;
  return styles.statusTextPass;
}

const styles = StyleSheet.create({
  shell: {
    gap: 12,
  },
  finding: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  findingHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  roleTitle: {
    alignItems: "flex-start",
    flex: 1,
    flexDirection: "row",
    gap: 9,
    minWidth: 240,
  },
  role: {
    color: "#17241c",
    fontSize: 16,
    fontWeight: "900",
  },
  headline: {
    color: "#405146",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPass: {
    backgroundColor: "#edf8ef",
    borderColor: "#a8d3b5",
  },
  statusWatch: {
    backgroundColor: "#fff7e7",
    borderColor: "#e0bf79",
  },
  statusBlocked: {
    backgroundColor: "#fff0ee",
    borderColor: "#dfa59d",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  statusTextPass: {
    color: "#1f5f39",
  },
  statusTextWatch: {
    color: "#805116",
  },
  statusTextBlocked: {
    color: "#8b1e18",
  },
  findingText: {
    color: "#22342a",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  evidenceList: {
    gap: 4,
  },
  evidence: {
    color: "#526257",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  gate: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 18,
  },
});
