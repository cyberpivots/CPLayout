import { Database, Map, Ruler, Satellite, SlidersHorizontal } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COORDINATE_FORMAT_LABELS, COORDINATE_FORMATS, type CoordinateDisplayFormat } from "@cplayout/core";
import {
  AppSettings,
  GPS_FIX_ORDER,
  MAP_STYLES,
  OFFLINE_PACKAGE_TYPES,
  ONLINE_IMAGERY_PROVIDER_CATALOG,
  type MapStyle,
  type MinimumGpsFixType,
  type OfflinePackageType,
} from "@cplayout/core";
import type { UnitSystem } from "@cplayout/core";

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps): React.JSX.Element {
  function update(next: Partial<AppSettings>): void {
    onChange({ ...settings, ...next });
  }

  return (
    <View style={styles.shell}>
      <SettingsGroup icon={<Ruler size={20} color="#254234" />} title="Units and Coordinates">
        <View style={styles.buttonRow}>
          <Choice active={settings.unitSystem === "metric"} label="Metric" onPress={() => update({ unitSystem: "metric" })} />
          <Choice active={settings.unitSystem === "us_survey_feet"} label="Imperial" onPress={() => update({ unitSystem: "us_survey_feet" })} />
        </View>
        <View style={styles.buttonRow}>
          {COORDINATE_FORMATS.map((format) => (
            <Choice
              key={format}
              active={settings.coordinateDisplayFormat === format}
              label={COORDINATE_FORMAT_LABELS[format]}
              onPress={() => update({ coordinateDisplayFormat: format as CoordinateDisplayFormat })}
            />
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup icon={<Map size={20} color="#254234" />} title="Map View">
        <Stepper
          label="Default zoom"
          value={settings.defaultZoomLevel.toFixed(2)}
          onDecrease={() => update({ defaultZoomLevel: clamp(settings.defaultZoomLevel / settings.drawing.zoomStepFactor, 0.25, 12) })}
          onIncrease={() => update({ defaultZoomLevel: clamp(settings.defaultZoomLevel * settings.drawing.zoomStepFactor, 0.25, 12) })}
        />
        <View style={styles.buttonRow}>
          {MAP_STYLES.map((style) => (
            <Choice
              key={style}
              active={settings.mapStyle === style}
              label={mapStyleLabel(style)}
              onPress={() => update({ mapStyle: style as MapStyle })}
            />
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup icon={<SlidersHorizontal size={20} color="#254234" />} title="Drawing and Snapping">
        <Stepper
          label="Vertex snap"
          value={`${settings.drawing.vertexSnapToleranceMeters.toFixed(1)} m`}
          onDecrease={() => update({ drawing: { ...settings.drawing, vertexSnapToleranceMeters: clamp(settings.drawing.vertexSnapToleranceMeters - 0.5, 0.1, 50) } })}
          onIncrease={() => update({ drawing: { ...settings.drawing, vertexSnapToleranceMeters: clamp(settings.drawing.vertexSnapToleranceMeters + 0.5, 0.1, 50) } })}
        />
        <Stepper
          label="Feature snap"
          value={`${settings.drawing.featureSnapToleranceMeters.toFixed(1)} m`}
          onDecrease={() => update({ drawing: { ...settings.drawing, featureSnapToleranceMeters: clamp(settings.drawing.featureSnapToleranceMeters - 1, 0.1, 100) } })}
          onIncrease={() => update({ drawing: { ...settings.drawing, featureSnapToleranceMeters: clamp(settings.drawing.featureSnapToleranceMeters + 1, 0.1, 100) } })}
        />
      </SettingsGroup>

      <SettingsGroup icon={<Satellite size={20} color="#254234" />} title="GPS Quality Gate">
        <Stepper
          label="Minimum satellites"
          value={`${settings.gpsQuality.minSatellites}`}
          onDecrease={() => update({ gpsQuality: { ...settings.gpsQuality, minSatellites: Math.max(0, settings.gpsQuality.minSatellites - 1) } })}
          onIncrease={() => update({ gpsQuality: { ...settings.gpsQuality, minSatellites: Math.min(80, settings.gpsQuality.minSatellites + 1) } })}
        />
        <Stepper
          label="Max HDOP"
          value={settings.gpsQuality.maxHdop.toFixed(1)}
          onDecrease={() => update({ gpsQuality: { ...settings.gpsQuality, maxHdop: clamp(settings.gpsQuality.maxHdop - 0.1, 0.1, 99) } })}
          onIncrease={() => update({ gpsQuality: { ...settings.gpsQuality, maxHdop: clamp(settings.gpsQuality.maxHdop + 0.1, 0.1, 99) } })}
        />
        <View style={styles.buttonRow}>
          {GPS_FIX_ORDER.filter((fixType) => fixType !== "invalid").map((fixType) => (
            <Choice
              key={fixType}
              active={settings.gpsQuality.minimumFixType === fixType}
              label={fixType.replaceAll("_", " ")}
              onPress={() => update({ gpsQuality: { ...settings.gpsQuality, minimumFixType: fixType as MinimumGpsFixType } })}
            />
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup icon={<Database size={20} color="#254234" />} title="Offline Map Packages">
        <View style={styles.buttonRow}>
          {OFFLINE_PACKAGE_TYPES.map((packageType) => (
            <Choice
              key={packageType}
              active={settings.offlineMaps.preferredPackageType === packageType}
              label={packageType.replaceAll("_", " ").toUpperCase()}
              onPress={() => update({ offlineMaps: { ...settings.offlineMaps, preferredPackageType: packageType as OfflinePackageType } })}
            />
          ))}
        </View>
        <Text style={styles.lockedText}>Network tiles: disabled · Attribution: required · Local directory: {settings.offlineMaps.packageDirectory}</Text>
      </SettingsGroup>

      <SettingsGroup icon={<Satellite size={20} color="#254234" />} title="Online Imagery Preview">
        <View style={styles.buttonRow}>
          <Choice
            active={!settings.onlineImagery.enabled}
            label="Off"
            onPress={() => update({ onlineImagery: { ...settings.onlineImagery, enabled: false } })}
          />
          <Choice
            active={settings.onlineImagery.enabled}
            label="USGS imagery"
            onPress={() => update({ onlineImagery: { ...settings.onlineImagery, enabled: true, providerId: "usgs_imagery_only" } })}
          />
        </View>
        <Stepper
          label="Tile cap"
          value={`${settings.onlineImagery.maxTilesPerView}`}
          onDecrease={() => update({ onlineImagery: { ...settings.onlineImagery, maxTilesPerView: clamp(settings.onlineImagery.maxTilesPerView - 8, 8, 128) } })}
          onIncrease={() => update({ onlineImagery: { ...settings.onlineImagery, maxTilesPerView: clamp(settings.onlineImagery.maxTilesPerView + 8, 8, 128) } })}
        />
        <Text style={styles.lockedText}>
          Optional live preview only · No bulk cache · {ONLINE_IMAGERY_PROVIDER_CATALOG[settings.onlineImagery.providerId].attribution}
        </Text>
      </SettingsGroup>
    </View>
  );
}

function SettingsGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        {icon}
        <Text style={styles.groupTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ label, value, onDecrease, onIncrease }: { label: string; value: string; onDecrease: () => void; onIncrease: () => void }): React.JSX.Element {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable onPress={onDecrease} style={styles.stepperButton}><Text style={styles.stepperButtonText}>-</Text></Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={onIncrease} style={styles.stepperButton}><Text style={styles.stepperButtonText}>+</Text></Pressable>
      </View>
    </View>
  );
}

function mapStyleLabel(style: MapStyle): string {
  switch (style) {
    case "field_light":
      return "Field";
    case "high_contrast":
      return "High contrast";
    case "imagery_package":
      return "Imagery";
    case "topographic":
      return "Topo";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  shell: {
    gap: 14,
  },
  group: {
    backgroundColor: "#fbfcf8",
    borderColor: "#d8ded6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  groupHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  groupTitle: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choice: {
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choiceActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  choiceText: {
    color: "#314339",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  choiceTextActive: {
    color: "#ffffff",
  },
  stepper: {
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
  stepperLabel: {
    color: "#293d31",
    fontSize: 14,
    fontWeight: "900",
  },
  stepperControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: "#254234",
    borderRadius: 8,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  stepperButtonText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
  },
  stepperValue: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
    minWidth: 72,
    textAlign: "center",
  },
  lockedText: {
    color: "#53655a",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
});
