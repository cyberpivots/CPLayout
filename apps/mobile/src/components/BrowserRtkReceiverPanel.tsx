import { CheckCircle2, CircleAlert, PlugZap, Satellite } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  projectLonLatToXy,
  type AppSettings,
  type ObstacleZone,
  type PivotProject,
  type ProjectMapFeature,
  type ProjectMapFeatureKind,
  type RtkQuality,
  type SourceConfidence,
  type SurveyPoint,
  type XY,
} from "@cplayout/core";
import {
  createNmeaStreamAccumulator,
  evaluateRtkQualityGate,
  latestPositionFromNmeaSamples,
  parseNmeaStreamChunk,
  rtkQualityFromNmeaSamples,
  surveyPointFromNmeaSamples,
  type ParsedNmeaSample,
} from "@cplayout/gnss";

export interface BrowserRtkReceiverStatus {
  connected: boolean;
  gateAccepted: boolean;
  quality: RtkQuality;
  sentenceCount: number;
  status: string;
}

interface BrowserRtkReceiverPanelProps {
  project: PivotProject;
  settings: AppSettings;
  onAddSurveyPoint: (point: Omit<SurveyPoint, "id" | "observedAt"> & { id?: string; observedAt?: string }) => void;
  onCommitBoundaryDraft: (vertices: XY[]) => void;
  onCommitObstacleDraft: (vertices: XY[], kind: ObstacleZone["kind"], confidence?: SourceConfidence) => void;
  onAddMapFeature: (feature: Omit<ProjectMapFeature, "id"> & { id?: string }) => void;
  onStatusChange?: (status: BrowserRtkReceiverStatus | null) => void;
}

type WebSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};

type WebSerial = {
  requestPort: () => Promise<WebSerialPort>;
};

type NavigatorWithSerial = Navigator & {
  serial?: WebSerial;
};

const SURVEY_ROLE_OPTIONS: { role: SurveyPoint["role"]; label: string }[] = [
  { role: "control", label: "Control" },
  { role: "boundary", label: "Boundary" },
  { role: "pivot_center", label: "Pivot" },
  { role: "water_source", label: "Water" },
  { role: "power_source", label: "Power" },
  { role: "obstacle", label: "Obstacle" },
  { role: "note", label: "Note" },
];

const OBSTACLE_KIND_OPTIONS: { kind: ObstacleZone["kind"]; label: string }[] = [
  { kind: "exclusion", label: "Exclusion" },
  { kind: "road", label: "Road" },
  { kind: "ditch", label: "Ditch" },
  { kind: "fence", label: "Fence" },
  { kind: "building", label: "Building" },
  { kind: "canal", label: "Canal" },
  { kind: "tree", label: "Tree" },
];

const MAP_FEATURE_OPTIONS: { kind: ProjectMapFeatureKind; label: string; geometry: ProjectMapFeature["geometry"]["type"] }[] = [
  { kind: "underground_pipeline", label: "Pipe line", geometry: "LineString" },
  { kind: "power_line", label: "Power line", geometry: "LineString" },
  { kind: "fence", label: "Fence line", geometry: "LineString" },
  { kind: "access_lane", label: "Access lane", geometry: "LineString" },
  { kind: "ditch", label: "Ditch line", geometry: "LineString" },
  { kind: "pump_location", label: "Pump point", geometry: "Point" },
  { kind: "power_pole", label: "Pole point", geometry: "Point" },
  { kind: "tree", label: "Tree point", geometry: "Point" },
  { kind: "end_gun_mark", label: "End gun point", geometry: "Point" },
];

export function BrowserRtkReceiverPanel({
  project,
  settings,
  onAddSurveyPoint,
  onCommitBoundaryDraft,
  onCommitObstacleDraft,
  onAddMapFeature,
  onStatusChange,
}: BrowserRtkReceiverPanelProps): React.JSX.Element {
  const serial = getWebSerial();
  const serialSupported = Boolean(serial);
  const [baudRateText, setBaudRateText] = useState("115200");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(serialSupported ? "No receiver connected." : "Web Serial is unavailable in this browser.");
  const [samples, setSamples] = useState<ParsedNmeaSample[]>([]);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [surveyRole, setSurveyRole] = useState<SurveyPoint["role"]>("control");
  const [obstacleKind, setObstacleKind] = useState<ObstacleZone["kind"]>("exclusion");
  const [mapFeatureKind, setMapFeatureKind] = useState<ProjectMapFeatureKind>("underground_pipeline");
  const [boundaryDraft, setBoundaryDraft] = useState<XY[]>([]);
  const [obstacleDraft, setObstacleDraft] = useState<XY[]>([]);
  const [mapFeatureDraft, setMapFeatureDraft] = useState<XY[]>([]);
  const portRef = useRef<WebSerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const runIdRef = useRef(0);

  const quality = useMemo(() => rtkQualityFromNmeaSamples(samples), [samples]);
  const gate = useMemo(() => evaluateRtkQualityGate(quality, settings.gpsQuality), [quality, settings.gpsQuality]);
  const latestPosition = useMemo(() => latestPositionFromNmeaSamples(samples), [samples]);
  const canCapture = gate.accepted && latestPosition !== null;
  const mapFeatureOption = MAP_FEATURE_OPTIONS.find((option) => option.kind === mapFeatureKind) ?? MAP_FEATURE_OPTIONS[0];
  const canSaveMapFeature = mapFeatureOption.geometry === "Point" ? canCapture : mapFeatureDraft.length >= 2;
  const confidence = confidenceForQuality(quality);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      void readerRef.current?.cancel().catch(() => undefined);
      void portRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    return () => {
      onStatusChange?.(null);
    };
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChange?.({
      connected,
      gateAccepted: gate.accepted,
      quality,
      sentenceCount,
      status,
    });
  }, [connected, gate.accepted, onStatusChange, quality, sentenceCount, status]);

  async function connect(): Promise<void> {
    if (!serial) {
      setStatus("Web Serial is unavailable in this browser.");
      return;
    }
    const baudRate = Number(baudRateText);
    if (!Number.isInteger(baudRate) || baudRate <= 0) {
      setStatus("Baud rate must be a positive integer.");
      return;
    }
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      setConnected(true);
      setStatus("Reading NMEA from browser serial port.");
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      void readNmeaLoop(port, runId);
    } catch (error) {
      setStatus(errorMessage(error, "Could not open browser serial receiver."));
    }
  }

  async function disconnect(): Promise<void> {
    runIdRef.current += 1;
    const reader = readerRef.current;
    const port = portRef.current;
    readerRef.current = null;
    portRef.current = null;
    try {
      await reader?.cancel();
    } catch {
      // The stream may already be closed by the browser.
    }
    try {
      await port?.close();
    } catch {
      // The browser may have closed the device after reader cancellation.
    }
    setConnected(false);
    setStatus("Receiver disconnected.");
  }

  async function readNmeaLoop(port: WebSerialPort, runId: number): Promise<void> {
    if (!port.readable) {
      setStatus("Serial port opened without a readable stream.");
      return;
    }
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let accumulator = createNmeaStreamAccumulator();
    try {
      while (runIdRef.current === runId) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const parsed = parseNmeaStreamChunk(accumulator, decoder.decode(value, { stream: true }));
        accumulator = parsed.accumulator;
        if (parsed.lines.length > 0) setSentenceCount((current) => current + parsed.lines.length);
        if (parsed.samples.length > 0) {
          setSamples((current) => [...current, ...parsed.samples].slice(-120));
        }
      }
    } catch (error) {
      if (runIdRef.current === runId) setStatus(errorMessage(error, "NMEA serial read failed."));
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Ignore stale reader cleanup.
      }
      if (readerRef.current === reader) readerRef.current = null;
    }
  }

  function captureSurveyPoint(): void {
    if (!canCapture) {
      setStatus("RTK gate is closed; survey capture was blocked.");
      return;
    }
    try {
      const point = surveyPointFromNmeaSamples({
        samples,
        projectCrs: project.projectCrs,
        id: `rtk-${Date.now().toString(36)}-${project.surveyPoints.length + 1}`,
        label: `${surveyRole.replaceAll("_", " ")} RTK ${project.surveyPoints.length + 1}`,
        role: surveyRole,
        observedAt: new Date().toISOString(),
      });
      onAddSurveyPoint(point);
      setStatus(`Captured ${surveyRole.replaceAll("_", " ")} survey point with ${point.confidence} confidence.`);
    } catch (error) {
      setStatus(errorMessage(error, "RTK survey capture failed."));
    }
  }

  function addBoundaryVertex(): void {
    addDraftVertex(setBoundaryDraft, "Boundary");
  }

  function addObstacleVertex(): void {
    addDraftVertex(setObstacleDraft, "Obstacle");
  }

  function addMapFeatureVertex(): void {
    addDraftVertex(setMapFeatureDraft, "Map feature");
  }

  function addDraftVertex(updateDraft: React.Dispatch<React.SetStateAction<XY[]>>, label: string): void {
    const point = latestProjectedPoint();
    if (!point) return;
    updateDraft((current) => [...current, point]);
    setStatus(`${label} RTK vertex added.`);
  }

  function commitBoundary(): void {
    if (boundaryDraft.length < 3) return;
    onCommitBoundaryDraft(boundaryDraft);
    setBoundaryDraft([]);
    setStatus("RTK boundary ring committed as projected XY.");
  }

  function commitObstacle(): void {
    if (obstacleDraft.length < 3) return;
    onCommitObstacleDraft(obstacleDraft, obstacleKind, confidence);
    setObstacleDraft([]);
    setStatus(`RTK ${obstacleKind} obstacle ring committed as projected XY.`);
  }

  function saveMapFeature(): void {
    if (!mapFeatureOption) return;
    const notes = "Captured through browser Web Serial NMEA; hardware compatibility remains unverified until a receiver proof session is recorded.";
    if (mapFeatureOption.geometry === "Point") {
      const point = latestProjectedPoint();
      if (!point) return;
      onAddMapFeature({
        name: `${mapFeatureOption.label} RTK`,
        kind: mapFeatureOption.kind,
        geometry: { type: "Point", point },
        confidence,
        notes,
      });
      setStatus(`RTK ${mapFeatureOption.label.toLowerCase()} saved as projected XY.`);
      return;
    }
    if (mapFeatureDraft.length < 2) return;
    onAddMapFeature({
      name: `${mapFeatureOption.label} RTK`,
      kind: mapFeatureOption.kind,
      geometry: { type: "LineString", vertices: mapFeatureDraft },
      confidence,
      notes,
    });
    setMapFeatureDraft([]);
    setStatus(`RTK ${mapFeatureOption.label.toLowerCase()} saved as projected XY.`);
  }

  function latestProjectedPoint(): XY | null {
    if (!canCapture || !latestPosition) {
      setStatus("RTK gate is closed; geometry capture was blocked.");
      return null;
    }
    try {
      return projectLonLatToXy({ longitude: latestPosition.longitude, latitude: latestPosition.latitude }, project.projectCrs);
    } catch (error) {
      setStatus(errorMessage(error, "Could not project the latest RTK fix."));
      return null;
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Satellite size={20} color="#254234" />
          <Text style={styles.title}>Browser RTK Receiver</Text>
        </View>
        <View style={[styles.gateBadge, gate.accepted ? styles.gateBadgeAccepted : styles.gateBadgeBlocked]} testID="rtk-gate-badge">
          {gate.accepted ? <CheckCircle2 size={16} color="#1f5f39" /> : <CircleAlert size={16} color="#8b1e18" />}
          <Text style={[styles.gateText, gate.accepted ? styles.gateTextAccepted : styles.gateTextBlocked]}>{gate.accepted ? "Gate accepted" : "Gate closed"}</Text>
        </View>
      </View>

      <View style={styles.connectionRow}>
        <TextInput
          accessibilityLabel="RTK serial baud rate"
          editable={!connected}
          keyboardType="number-pad"
          onChangeText={setBaudRateText}
          style={styles.baudInput}
          value={baudRateText}
        />
        <PanelButton
          disabled={!serialSupported}
          icon={<PlugZap size={16} color={serialSupported ? "#254234" : "#68766d"} />}
          label={connected ? "Disconnect" : "Open Serial"}
          onPress={() => { void (connected ? disconnect() : connect()); }}
        />
      </View>

      <Text style={styles.statusText} testID="rtk-status">{status}</Text>
      <View style={styles.metricsGrid}>
        <RtkMetric label="Fix" value={quality.fixType} />
        <RtkMetric label="Satellites" value={formatNullable(quality.satellites)} />
        <RtkMetric label="HDOP" value={formatNullable(quality.hdop)} />
        <RtkMetric label="VDOP" value={formatNullable(quality.vdop)} />
        <RtkMetric label="PDOP" value={formatNullable(quality.pdop)} />
        <RtkMetric label="Correction age" value={quality.correctionAgeSeconds === null ? "unknown" : `${quality.correctionAgeSeconds}s`} />
        <RtkMetric label="Est. accuracy" value={quality.horizontalAccuracyMeters === null ? "unknown" : `${quality.horizontalAccuracyMeters.toFixed(3)} m`} />
        <RtkMetric label="NMEA lines" value={`${sentenceCount}`} />
      </View>
      {!gate.accepted ? <Text style={styles.gateReasons} testID="rtk-gate-reasons">{gate.reasons.slice(0, 3).join("; ") || "Waiting for accepted NMEA quality."}</Text> : null}

      <View style={styles.captureBlock}>
        <Text style={styles.groupTitle}>Survey Point</Text>
        <View style={styles.choiceRow}>
          {SURVEY_ROLE_OPTIONS.map((option) => (
            <ChoiceButton key={option.role} active={surveyRole === option.role} label={option.label} onPress={() => setSurveyRole(option.role)} />
          ))}
        </View>
        <PanelButton disabled={!canCapture} label="Capture Survey Point" primary onPress={captureSurveyPoint} />
      </View>

      <View style={styles.captureBlock}>
        <Text style={styles.groupTitle}>Ordered Rings</Text>
        <View style={styles.actionRow}>
          <PanelButton disabled={!canCapture} label={`Add Boundary (${boundaryDraft.length})`} onPress={addBoundaryVertex} />
          <PanelButton disabled={boundaryDraft.length < 3} label="Commit Boundary" primary onPress={commitBoundary} />
          <PanelButton disabled={boundaryDraft.length === 0} label="Clear Boundary" onPress={() => setBoundaryDraft([])} />
        </View>
        <View style={styles.choiceRow}>
          {OBSTACLE_KIND_OPTIONS.map((option) => (
            <ChoiceButton key={option.kind} active={obstacleKind === option.kind} label={option.label} onPress={() => setObstacleKind(option.kind)} />
          ))}
        </View>
        <View style={styles.actionRow}>
          <PanelButton disabled={!canCapture} label={`Add Obstacle (${obstacleDraft.length})`} onPress={addObstacleVertex} />
          <PanelButton disabled={obstacleDraft.length < 3} label="Commit Obstacle" primary onPress={commitObstacle} />
          <PanelButton disabled={obstacleDraft.length === 0} label="Clear Obstacle" onPress={() => setObstacleDraft([])} />
        </View>
      </View>

      <View style={styles.captureBlock}>
        <Text style={styles.groupTitle}>Map Feature</Text>
        <View style={styles.choiceRow}>
          {MAP_FEATURE_OPTIONS.map((option) => (
            <ChoiceButton key={option.kind} active={mapFeatureKind === option.kind} label={option.label} onPress={() => setMapFeatureKind(option.kind)} />
          ))}
        </View>
        <View style={styles.actionRow}>
          <PanelButton disabled={!canCapture || mapFeatureOption.geometry === "Point"} label={`Add Feature Vertex (${mapFeatureDraft.length})`} onPress={addMapFeatureVertex} />
          <PanelButton disabled={!canSaveMapFeature} label={mapFeatureOption.geometry === "Point" ? "Save Point Feature" : "Save Line Feature"} primary onPress={saveMapFeature} />
          <PanelButton disabled={mapFeatureDraft.length === 0} label="Clear Feature" onPress={() => setMapFeatureDraft([])} />
        </View>
      </View>
    </View>
  );
}

function getWebSerial(): WebSerial | undefined {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return undefined;
  return (navigator as NavigatorWithSerial).serial;
}

function confidenceForQuality(quality: RtkQuality): SourceConfidence {
  if (quality.fixType === "rtk_fixed") return "rtk_fixed";
  if (quality.fixType === "rtk_float") return "rtk_float";
  if (quality.fixType === "dgps") return "dgps";
  if (quality.fixType === "autonomous" || quality.fixType === "ppp") return "autonomous_gps";
  return "user_estimated";
}

function formatNullable(value: number | null): string {
  if (value === null) return "unknown";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function RtkMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choiceButton, active && styles.choiceButtonActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PanelButton({ disabled = false, icon, label, onPress, primary = false }: { disabled?: boolean; icon?: React.ReactNode; label: string; onPress: () => void; primary?: boolean }): React.JSX.Element {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.panelButton, primary && styles.panelButtonPrimary, disabled && styles.panelButtonDisabled]}>
      {icon}
      <Text style={[styles.panelButtonText, primary && styles.panelButtonTextPrimary, disabled && styles.panelButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  headerTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: "#17241c",
    fontSize: 16,
    fontWeight: "900",
  },
  gateBadge: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  gateBadgeAccepted: {
    backgroundColor: "#eef8ee",
    borderColor: "#b8d9bc",
  },
  gateBadgeBlocked: {
    backgroundColor: "#fff1ee",
    borderColor: "#e7c1b9",
  },
  gateText: {
    fontSize: 12,
    fontWeight: "900",
  },
  gateTextAccepted: {
    color: "#1f5f39",
  },
  gateTextBlocked: {
    color: "#8b1e18",
  },
  connectionRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  baudInput: {
    backgroundColor: "#ffffff",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1d2c22",
    fontSize: 14,
    fontWeight: "800",
    minHeight: 40,
    minWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusText: {
    color: "#405448",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    backgroundColor: "#f4f7f1",
    borderColor: "#dbe5d8",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 126,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricLabel: {
    color: "#607067",
    fontSize: 11,
    fontWeight: "800",
  },
  metricValue: {
    color: "#1d2c22",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  gateReasons: {
    color: "#8b1e18",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  captureBlock: {
    borderColor: "#e1e8df",
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 10,
  },
  groupTitle: {
    color: "#26392f",
    fontSize: 13,
    fontWeight: "900",
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceButton: {
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  choiceButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  choiceText: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  choiceTextActive: {
    color: "#ffffff",
  },
  panelButton: {
    alignItems: "center",
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  panelButtonPrimary: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  panelButtonDisabled: {
    opacity: 0.45,
  },
  panelButtonText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
  },
  panelButtonTextPrimary: {
    color: "#ffffff",
  },
  panelButtonTextDisabled: {
    color: "#68766d",
  },
});
