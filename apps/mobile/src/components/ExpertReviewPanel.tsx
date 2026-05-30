import { AlertTriangle, Check, ClipboardList, Clock3, Database, Eye, MapPinned, Satellite, Sparkles, Upload, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { buildExpertReviewFindings, deriveRecommendationReviewState, type AppSettings, type ExpertReviewFinding, type LayoutDecisionRecord, type LayoutEvidenceRecord, type LayoutResult, type ModelRecommendation, type PivotProject } from "@cplayout/core";
import { buildPivotCenterModelRecommendation, evaluateLayout, optimizePivotCenter } from "@cplayout/geometry";
import {
  appendLayoutDecisionAsync,
  appendGeneratedModelRecommendationsAsync,
  importModelRecommendationsForProjectAsync,
  loadProjectReviewDataAsync,
  type ProjectReviewData,
} from "@cplayout/project-store";

interface ExpertReviewPanelProps {
  onApplyRecommendation: (recommendation: ModelRecommendation) => string | null;
  onPreviewRecommendation?: (recommendation: ModelRecommendation | null) => void;
  project: PivotProject;
  result: LayoutResult;
  selectedPreviewRecommendationId?: string | null;
  settings: AppSettings;
}

export function ExpertReviewPanel({ onApplyRecommendation, onPreviewRecommendation, project, result, selectedPreviewRecommendationId, settings }: ExpertReviewPanelProps): React.JSX.Element {
  const findings = useMemo(
    () => buildExpertReviewFindings(project, result, settings),
    [project, result, settings],
  );
  const [reviewData, setReviewData] = useState<ProjectReviewData>(() => emptyReviewData());
  const [importText, setImportText] = useState("");
  const [pendingApply, setPendingApply] = useState<ModelRecommendation | null>(null);
  const [status, setStatus] = useState("Recommendations are evidence until an operator records a decision or applies projected XY geometry.");

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
      const imported = await importModelRecommendationsForProjectAsync(project, importText);
      const data = await loadProjectReviewDataAsync(project.id);
      setReviewData(data);
      setImportText("");
      const autoApplied = await autoApplyBoundaryAssist(imported);
      if (!autoApplied) {
        setStatus(`Imported ${imported.length} model recommendation${imported.length === 1 ? "" : "s"} with ${data.evidenceRecords.length} evidence record${data.evidenceRecords.length === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function generatePivotCandidates(): Promise<void> {
    try {
      const createdAt = new Date().toISOString();
      const recommendations = optimizePivotCenter(project, {
        gridDivisions: 13,
        maxAlternatives: 8,
        includeVisualCenterSeed: true,
      }).map((alternative) => buildPivotCenterModelRecommendation(project, alternative, createdAt));
      const data = await appendGeneratedModelRecommendationsAsync(project, recommendations);
      setReviewData(data);
      setStatus(`Generated ${recommendations.length} pivot candidate${recommendations.length === 1 ? "" : "s"} for review. No geometry was applied.`);
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
          ? "Accepted as an operator review record."
          : decision === "rejected"
            ? "Rejected in browser review; canonical geometry was not mutated."
            : "Deferred for later field or engineering review.",
      });
      setReviewData(nextData);
      setStatus(`${decisionLabel(decision)} recorded for ${recommendation.id}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function applyRecommendation(recommendation: ModelRecommendation): Promise<void> {
    try {
      if (!hasProjectedGeometry(recommendation)) {
        setStatus(`Recommendation ${recommendation.id} has no projected XY geometry to apply.`);
        return;
      }
      setPendingApply(recommendation);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function confirmApplyRecommendation(): Promise<void> {
    if (!pendingApply) return;
    try {
      const recommendation = pendingApply;
      const applyError = onApplyRecommendation(recommendation);
      if (applyError) {
        setStatus(applyError);
        return;
      }
      await recordDecision(recommendation, "accepted");
      onPreviewRecommendation?.(null);
      setPendingApply(null);
      setStatus(`Applied projected XY geometry from ${recommendation.id}. Undo is available in the layout editor.`);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function autoApplyBoundaryAssist(imported: ModelRecommendation[]): Promise<boolean> {
    const recommendation = sortedRecommendations(imported).find(isAutoApplyBoundaryAssist);
    if (!recommendation) return false;
    const applyError = onApplyRecommendation(recommendation);
    if (applyError) {
      setStatus(`Imported ML Boundary Assist evidence, but auto-apply was blocked: ${applyError}`);
      return true;
    }
    const createdAt = new Date().toISOString();
    const nextData = await appendLayoutDecisionAsync(project.id, {
      id: `${recommendation.id}:auto-accepted:${createdAt.replace(/[^0-9]/g, "").slice(0, 17)}`,
      projectId: project.id,
      createdAt,
      decidedBy: "import",
      decision: "accepted",
      recommendationId: recommendation.id,
      evidenceIds: recommendation.evidenceIds,
      reason: "Auto-applied GPU-backed experimental ML Boundary Assist projected-XY boundary to the current unsaved editor workspace; Save remains explicit.",
    });
    setReviewData(nextData);
    onPreviewRecommendation?.(null);
    setStatus(`Imported and auto-applied ML Boundary Assist boundary from ${recommendation.id}. Undo is available; Save remains explicit.`);
    return true;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.reviewWorkspace}>
        <View style={styles.importHeader}>
          <View>
            <Text style={styles.workspaceTitle}>ML Boundary Assist</Text>
            <Text style={styles.workspaceSubtitle}>{reviewData.modelRecommendations.length} imported · {reviewData.layoutDecisions.length} decisions saved</Text>
          </View>
          <Text style={styles.workspaceBadge}>Adjacent storage</Text>
        </View>
        <TextInput
          multiline
          onChangeText={setImportText}
          placeholder="Paste boundary-improvement-loop JSON, visual-layout-review JSON, ModelRecommendation JSON array, or projected-XY GeoJSON FeatureCollection"
          style={styles.importInput}
          value={importText}
        />
        <View style={styles.importActions}>
          <ReviewButton icon={<Sparkles size={16} color="#ffffff" />} label="Generate Pivot Candidates" primary onPress={generatePivotCandidates} />
          <ReviewButton icon={<Upload size={16} color="#ffffff" />} label="Import" primary onPress={importRecommendations} />
          <Text style={styles.statusLine}>{status}</Text>
        </View>
        {pendingApply ? (
          <View style={styles.applyConfirm}>
            <View style={styles.applyConfirmText}>
              <Text style={styles.confirmTitle}>Confirm Apply</Text>
              <Text style={styles.geometrySummary}>{applyMetricsSummary(project, result, pendingApply)}</Text>
            </View>
            <View style={styles.decisionActions}>
              <ReviewButton icon={<Check size={16} color="#ffffff" />} label="Apply XY" primary onPress={confirmApplyRecommendation} />
              <ReviewButton icon={<X size={16} color="#254234" />} label="Cancel" onPress={() => setPendingApply(null)} />
            </View>
          </View>
        ) : null}
        <View style={styles.recommendationList}>
          {reviewData.modelRecommendations.length === 0 ? (
            <Text style={styles.emptyText}>No model recommendations imported for this project.</Text>
          ) : sortedRecommendations(reviewData.modelRecommendations).map((recommendation) => {
            const evidenceRecords = evidenceForRecommendation(recommendation, reviewData.evidenceRecords);
            const previewSelected = recommendation.id === selectedPreviewRecommendationId;
            return (
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
              {gpuSummary(recommendation, evidenceRecords) ? <Text style={styles.geometrySummary}>{gpuSummary(recommendation, evidenceRecords)}</Text> : null}
              {scoreBreakdownSummary(recommendation) ? <Text style={styles.geometrySummary}>{scoreBreakdownSummary(recommendation)}</Text> : null}
              <View style={styles.evidenceRecordList}>
                {evidenceRecords.length === 0 ? (
                  <Text style={styles.evidenceRecord}>Evidence: {recommendation.evidenceIds.length === 0 ? "none linked" : recommendation.evidenceIds.join(", ")}</Text>
                ) : evidenceRecords.map((record) => (
                  <View key={record.id} style={styles.evidenceRecordItem}>
                    <Text style={styles.evidenceRecord}>
                      Evidence {record.sourceKind} · confidence {(record.confidence * 100).toFixed(0)}% · {record.reviewStatus}
                    </Text>
                    <Text style={styles.evidenceRecord}>{record.summary}</Text>
                    {record.notes ? <Text style={styles.evidenceRecordMuted}>{record.notes}</Text> : null}
                    {metricsSummary(record) ? <Text style={styles.evidenceRecordMuted}>{metricsSummary(record)}</Text> : null}
                    {artifactHashSummary(record).map((line) => (
                      <Text key={line} style={styles.evidenceRecordMuted}>{line}</Text>
                    ))}
                  </View>
                ))}
              </View>
              {recommendation.warnings.map((warning) => (
                <Text key={warning} style={styles.warningNote}>{warning}</Text>
              ))}
              <View style={styles.decisionActions}>
                <ReviewButton icon={<Eye size={16} color={previewSelected ? "#ffffff" : "#254234"} />} label={previewSelected ? "Previewing" : "Preview"} primary={previewSelected} onPress={() => onPreviewRecommendation?.(previewSelected ? null : recommendation)} />
                <ReviewButton icon={<Check size={16} color="#ffffff" />} label="Accept" primary onPress={() => recordDecision(recommendation, "accepted")} />
                <ReviewButton icon={<MapPinned size={16} color="#ffffff" />} label="Apply" primary onPress={() => applyRecommendation(recommendation)} />
                <ReviewButton icon={<X size={16} color="#254234" />} label="Reject" onPress={() => recordDecision(recommendation, "rejected")} />
                <ReviewButton icon={<Clock3 size={16} color="#254234" />} label="Defer" onPress={() => recordDecision(recommendation, "deferred")} />
              </View>
            </View>
          ); })}
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

function scoreBreakdownSummary(recommendation: ModelRecommendation): string | null {
  const breakdown = recommendation.scoreBreakdown;
  if (!breakdown) return null;
  if (breakdown.edgeAlignment !== undefined || breakdown.rectilinearity !== undefined || breakdown.nonCircularity !== undefined) {
    return `Boundary score: edge ${formatScorePart(breakdown.edgeAlignment)} · rectilinearity ${formatScorePart(breakdown.rectilinearity)} · non-circular ${formatScorePart(breakdown.nonCircularity)} · containment ${formatScorePart(breakdown.containment)} · operator ${formatScorePart(breakdown.operatorLabelAlignment)}`;
  }
  return `Score: coverage ${formatScorePart(breakdown.coverage)} · outside ${formatScorePart(breakdown.outsideField)} · obstacles ${formatScorePart(breakdown.obstacle)} · distance ${formatScorePart(breakdown.distance)} · feasibility ${formatScorePart(breakdown.feasibility)}`;
}

function sortedRecommendations(recommendations: ModelRecommendation[]): ModelRecommendation[] {
  return [...recommendations].sort((left, right) => {
    const leftFeasible = recommendationFeasible(left);
    const rightFeasible = recommendationFeasible(right);
    if (leftFeasible !== rightFeasible) return leftFeasible ? -1 : 1;
    if ((right.score ?? Number.NEGATIVE_INFINITY) !== (left.score ?? Number.NEGATIVE_INFINITY)) {
      return (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY);
    }
    if (left.reviewStatus !== right.reviewStatus) return left.reviewStatus.localeCompare(right.reviewStatus);
    return left.id.localeCompare(right.id);
  });
}

function recommendationFeasible(recommendation: ModelRecommendation): boolean {
  const metadata = recommendation.metadata;
  return Boolean(metadata && typeof metadata.feasible === "boolean" && metadata.feasible);
}

function applyMetricsSummary(project: PivotProject, currentResult: LayoutResult, recommendation: ModelRecommendation): string {
  const proposedProject = {
    ...project,
    ...(recommendation.proposedGeometry.fieldBoundary ? { fieldBoundary: recommendation.proposedGeometry.fieldBoundary } : {}),
    ...(recommendation.proposedGeometry.pivotCenter ? { pivotCenter: recommendation.proposedGeometry.pivotCenter } : {}),
    ...(recommendation.proposedGeometry.machine ? { machine: recommendation.proposedGeometry.machine } : {}),
    ...(recommendation.proposedGeometry.obstaclePolygons ? {
      obstacles: [
        ...project.obstacles,
        ...recommendation.proposedGeometry.obstaclePolygons.map((polygon, index) => ({
          id: `${recommendation.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-preview-obstacle-${index + 1}`,
          name: `Recommendation Obstacle ${index + 1}`,
          kind: "exclusion" as const,
          polygon,
          bufferMeters: 0,
          hardConflict: true,
          noSpray: true,
          confidence: "optimized" as const,
        })),
      ],
    } : {}),
  };
  try {
    const nextResult = evaluateLayout(proposedProject);
    return `Before: coverage ${currentResult.metrics.coveragePercent.toFixed(1)}%, outside ${currentResult.metrics.outsideFieldAcres.toFixed(3)} ac, conflicts ${currentResult.metrics.obstacleConflictCount}. After: coverage ${nextResult.metrics.coveragePercent.toFixed(1)}%, outside ${nextResult.metrics.outsideFieldAcres.toFixed(3)} ac, conflicts ${nextResult.metrics.obstacleConflictCount}.`;
  } catch (error) {
    return `Unable to evaluate before/after metrics: ${errorMessage(error)}`;
  }
}

function formatScorePart(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "n/a";
}

function hasProjectedGeometry(recommendation: ModelRecommendation): boolean {
  const geometry = recommendation.proposedGeometry;
  return Boolean(geometry.pivotCenter || geometry.fieldBoundary || geometry.machine || (geometry.obstaclePolygons && geometry.obstaclePolygons.length > 0));
}

function isAutoApplyBoundaryAssist(recommendation: ModelRecommendation): boolean {
  const metadata = recommendation.metadata ?? {};
  return recommendation.reviewStatus === "accepted"
    && recommendation.proposedGeometry.fieldBoundary !== undefined
    && metadata.schemaVersion === "cplayout-boundary-improvement-loop-v1"
    && metadata.autoApplyEligible === true
    && metadata.gpuBacked === true;
}

function evidenceForRecommendation(
  recommendation: ModelRecommendation,
  records: LayoutEvidenceRecord[],
): LayoutEvidenceRecord[] {
  const ids = new Set(recommendation.evidenceIds);
  return records.filter((record) => ids.has(record.id));
}

function metricsSummary(record: LayoutEvidenceRecord): string | null {
  const metrics = record.metrics;
  if (!metrics) return null;
  const parts = [
    metricBooleanPart(metrics, "gpuCudaAvailable", "GPU CUDA"),
    metricPart(metrics, "bestOperatorIoU", "operator IoU"),
    metricPart(metrics, "centerOffsetRatio", "center offset"),
    metricPart(metrics, "radiusMismatchRatio", "radius mismatch"),
    metricPart(metrics, "detectionConfidence", "detection"),
    metricPart(metrics, "confidence", "boundary confidence"),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `Image metrics: ${parts.join(" · ")}` : null;
}

function metricPart(metrics: Record<string, unknown>, key: string, label: string): string | null {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? `${label} ${value.toFixed(4)}` : null;
}

function metricBooleanPart(metrics: Record<string, unknown>, key: string, label: string): string | null {
  const value = metrics[key];
  return typeof value === "boolean" ? `${label} ${value ? "yes" : "no"}` : null;
}

function gpuSummary(recommendation: ModelRecommendation, evidenceRecords: LayoutEvidenceRecord[]): string | null {
  const metadata = recommendation.metadata ?? {};
  const metrics = evidenceRecords.find((record) => record.metrics?.schemaVersion === "cplayout-boundary-improvement-loop-v1")?.metrics;
  if (metadata.schemaVersion !== "cplayout-boundary-improvement-loop-v1" && !metrics) return null;
  const gpuBacked = metadata.gpuBacked === true || metrics?.gpuCudaAvailable === true;
  const iterations = typeof metadata.iterationCount === "number" ? metadata.iterationCount : metrics?.iterationCount;
  return `Boundary loop: ${gpuBacked ? "GPU-backed" : "no CUDA evidence"} · ${String(iterations ?? "n/a")} iterations · ${String(metadata.acceptanceStatus ?? metrics?.acceptanceStatus ?? "unknown")}`;
}

function artifactHashSummary(record: LayoutEvidenceRecord): string[] {
  const artifacts = record.artifacts;
  if (!artifacts) return [];
  return Object.entries(artifacts).flatMap(([name, value]) => {
    if (!isRecord(value) || typeof value.sha256 !== "string") return [];
    const dimensions = isRecord(value.image) && typeof value.image.width === "number" && typeof value.image.height === "number"
      ? ` · ${value.image.width}x${value.image.height}`
      : "";
    return [`${name}: sha256 ${value.sha256.slice(0, 12)}...${dimensions}`];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  applyConfirm: {
    backgroundColor: "#eef4ef",
    borderColor: "#9fb9a7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: 12,
  },
  applyConfirmText: {
    flex: 1,
    gap: 4,
    minWidth: 260,
  },
  confirmTitle: {
    color: "#17241c",
    fontSize: 13,
    fontWeight: "900",
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
  evidenceRecordList: {
    gap: 6,
  },
  evidenceRecordItem: {
    borderColor: "#d7e0d9",
    borderLeftWidth: 3,
    gap: 3,
    paddingLeft: 8,
  },
  evidenceRecord: {
    color: "#33463a",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  evidenceRecordMuted: {
    color: "#66766b",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
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
