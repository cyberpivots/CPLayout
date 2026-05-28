import { AlertTriangle, Check, ClipboardList, Clock3, Database, MapPinned, Satellite, Upload, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { buildExpertReviewFindings, deriveRecommendationReviewState, type AppSettings, type ExpertReviewFinding, type LayoutDecisionRecord, type LayoutResult, type ModelRecommendation, type PivotProject } from "@cplayout/core";
import {
  appendLayoutDecisionAsync,
  importModelRecommendationsAsync,
  loadProjectReviewDataAsync,
  type ProjectReviewData,
} from "@cplayout/project-store";

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
  const [reviewData, setReviewData] = useState<ProjectReviewData>(() => emptyReviewData());
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState("Review decisions are stored adjacent to this browser project and do not change geometry.");

  useEffect(() => {
    let active = true;
    void loadProjectReviewDataAsync(project.id)
      .then((data) => {
        if (active) setReviewData(data);
      })
      .catch((error) => {
        if (active) setStatus(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  async function importRecommendations(): Promise<void> {
    try {
      const imported = await importModelRecommendationsAsync(project.id, importText);
      const data = await loadProjectReviewDataAsync(project.id);
      setReviewData(data);
      setImportText("");
      setStatus(`Imported ${imported.length} model recommendation${imported.length === 1 ? "" : "s"} for review.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function recordDecision(recommendation: ModelRecommendation, decision: LayoutDecisionRecord["decision"]): Promise<void> {
    try {
      const createdAt = new Date().toISOString();
      const nextData = await appendLayoutDecisionAsync(project.id, {
        id: `${recommendation.id}:${decision}:${createdAt.replace(/[^0-9]/g, "").slice(0, 17)}`,
        projectId: project.id,
        createdAt,
        decidedBy: "operator",
        decision,
        recommendationId: recommendation.id,
        evidenceIds: recommendation.evidenceIds,
        reason: decision === "accepted"
          ? "Accepted for review record only; canonical geometry was not mutated."
          : decision === "rejected"
            ? "Rejected in browser review; canonical geometry was not mutated."
            : "Deferred for later field or engineering review.",
      });
      setReviewData(nextData);
      setStatus(`${decisionLabel(decision)} recorded for ${recommendation.id}. Project geometry was not changed.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  return (
    <View style={styles.shell}>
      <View style={styles.reviewWorkspace}>
        <View style={styles.importHeader}>
          <View>
            <Text style={styles.workspaceTitle}>Model Recommendations</Text>
            <Text style={styles.workspaceSubtitle}>{reviewData.modelRecommendations.length} imported · {reviewData.layoutDecisions.length} decisions saved</Text>
          </View>
          <Text style={styles.workspaceBadge}>Adjacent storage</Text>
        </View>
        <TextInput
          multiline
          onChangeText={setImportText}
          placeholder="Paste ModelRecommendation JSON array or projected-XY GeoJSON FeatureCollection"
          style={styles.importInput}
          value={importText}
        />
        <View style={styles.importActions}>
          <ReviewButton icon={<Upload size={16} color="#ffffff" />} label="Import" primary onPress={importRecommendations} />
          <Text style={styles.statusLine}>{status}</Text>
        </View>
        <View style={styles.recommendationList}>
          {reviewData.modelRecommendations.length === 0 ? (
            <Text style={styles.emptyText}>No model recommendations imported for this project.</Text>
          ) : reviewData.modelRecommendations.map((recommendation) => (
            <View key={recommendation.id} style={styles.recommendation}>
              <View style={styles.recommendationHeader}>
                <View>
                  <Text style={styles.recommendationTitle}>{recommendation.summary}</Text>
                  <Text style={styles.recommendationMeta}>
                    {recommendation.modelName} {recommendation.modelVersion} · confidence {(recommendation.confidence * 100).toFixed(0)}% · score {recommendation.score?.toFixed(1) ?? "n/a"}
                  </Text>
                </View>
                <Text style={styles.reviewStatus}>{deriveRecommendationReviewState(recommendation, reviewData.layoutDecisions)}</Text>
              </View>
              <Text style={styles.geometrySummary}>{geometrySummary(recommendation)}</Text>
              {recommendation.warnings.map((warning) => (
                <Text key={warning} style={styles.warningNote}>{warning}</Text>
              ))}
              <View style={styles.decisionActions}>
                <ReviewButton icon={<Check size={16} color="#ffffff" />} label="Accept" primary onPress={() => recordDecision(recommendation, "accepted")} />
                <ReviewButton icon={<X size={16} color="#254234" />} label="Reject" onPress={() => recordDecision(recommendation, "rejected")} />
                <ReviewButton icon={<Clock3 size={16} color="#254234" />} label="Defer" onPress={() => recordDecision(recommendation, "deferred")} />
              </View>
            </View>
          ))}
        </View>
      </View>

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
          <View style={styles.actionList}>
            {actionsForFinding(finding).map((action) => (
              <Text key={action} style={styles.actionItem}>Action: {action}</Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ReviewButton({ icon, label, onPress, primary = false }: { icon: React.ReactNode; label: string; onPress: () => void; primary?: boolean }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.reviewButton, primary && styles.reviewButtonPrimary]}>
      {icon}
      <Text style={[styles.reviewButtonText, primary && styles.reviewButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function emptyReviewData(): ProjectReviewData {
  return { evidenceRecords: [], modelRecommendations: [], layoutDecisions: [] };
}

function decisionLabel(decision: LayoutDecisionRecord["decision"]): string {
  if (decision === "accepted") return "Accept";
  if (decision === "rejected") return "Reject";
  return "Defer";
}

function geometrySummary(recommendation: ModelRecommendation): string {
  const parts = [];
  if (recommendation.proposedGeometry.pivotCenter) {
    const point = recommendation.proposedGeometry.pivotCenter;
    parts.push(`pivot (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
  }
  if (recommendation.proposedGeometry.fieldBoundary) parts.push(`${recommendation.proposedGeometry.fieldBoundary.length} boundary vertices`);
  if (recommendation.proposedGeometry.obstaclePolygons) parts.push(`${recommendation.proposedGeometry.obstaclePolygons.length} obstacle polygons`);
  return parts.length > 0 ? `${recommendation.projectCrs} · ${parts.join(" · ")}` : `${recommendation.projectCrs} · metadata only`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Review storage operation failed.";
}

function actionsForFinding(finding: ExpertReviewFinding): string[] {
  if (finding.status === "pass") return ["Keep this evidence in the exported ZIP before field handoff."];
  switch (finding.role) {
    case "Product/UX":
      return ["Open Settings and switch coordinate display to decimal degrees for field entry."];
    case "GIS/Mapping":
      return ["Use online imagery only as a live reference; review GeoJSON/KML/KMZ imports and project them into the project CRS before geometry mutation."];
    case "Architecture/Storage":
      return ["Save Local, export ZIP, and keep native SQLite claims blocked until device verification is complete."];
    case "ML Feasibility":
      return ["Keep ML/Python/GDAL work in offline preprocessing until a native offline runtime proof exists."];
    case "QA/Safety":
      return ["Fix obstacle conflicts or outside-field coverage in Layout, then save and export a fresh ZIP."];
  }
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
  reviewWorkspace: {
    backgroundColor: "#f7f3e8",
    borderColor: "#d9ccb1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  importHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  workspaceTitle: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  workspaceSubtitle: {
    color: "#526257",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  workspaceBadge: {
    backgroundColor: "#e7f1ea",
    borderColor: "#afc7b6",
    borderRadius: 8,
    borderWidth: 1,
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  importInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cfc6b3",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1c2a21",
    fontSize: 12,
    fontWeight: "700",
    minHeight: 92,
    padding: 10,
    textAlignVertical: "top",
  },
  importActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusLine: {
    color: "#405146",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    minWidth: 220,
  },
  recommendationList: {
    gap: 10,
  },
  recommendation: {
    backgroundColor: "#fffdf7",
    borderColor: "#ded4bf",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  recommendationHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  recommendationTitle: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
  recommendationMeta: {
    color: "#58675e",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  reviewStatus: {
    backgroundColor: "#eef4ef",
    borderColor: "#b7c8bb",
    borderRadius: 8,
    borderWidth: 1,
    color: "#254234",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textTransform: "uppercase",
  },
  geometrySummary: {
    color: "#33463a",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  warningNote: {
    color: "#805116",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  decisionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reviewButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#b7c8bb",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  reviewButtonPrimary: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  reviewButtonText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
  },
  reviewButtonTextPrimary: {
    color: "#ffffff",
  },
  emptyText: {
    color: "#526257",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
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
  actionList: {
    gap: 4,
  },
  actionItem: {
    color: "#1f4432",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
});
