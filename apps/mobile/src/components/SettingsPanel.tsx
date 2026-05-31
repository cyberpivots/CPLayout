import { Database, Map, Ruler, Satellite, SlidersHorizontal } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { COORDINATE_FORMAT_LABELS, COORDINATE_FORMATS, type CoordinateDisplayFormat } from "@cplayout/core";
import {
  AppSettings,
  GPS_FIX_ORDER,
  MAP_STYLES,
  OFFLINE_PACKAGE_TYPES,
  ONLINE_IMAGERY_PROVIDER_CATALOG,
  ONLINE_IMAGERY_PROVIDER_LIST,
  validateCustomOpenImagerySource,
  resolveOnlineImageryProvider,
  type OnlineImageryCustomSource,
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
  const [customFormVisible, setCustomFormVisible] = useState(settings.onlineImagery.providerId === "custom_open_xyz");
  const [customDraft, setCustomDraft] = useState<CustomImageryDraft>(() => customDraftFromSettings(settings));
  const customValidation = useMemo(() => validateCustomOpenImagerySource(customDraft), [customDraft]);
  const activeProvider = useMemo(() => {
    try {
      return resolveOnlineImageryProvider(settings.onlineImagery.providerId, settings.onlineImagery.customSource);
    } catch {
      return ONLINE_IMAGERY_PROVIDER_CATALOG[settings.onlineImagery.providerId];
    }
  }, [settings.onlineImagery.customSource, settings.onlineImagery.providerId]);
  const imagerySourceSummary = settings.onlineImagery.enabled
    ? `${activeProvider.coverageLabel} · ${activeProvider.projection} · ${activeProvider.tileScheme.toUpperCase()} ${activeProvider.tileSize}px · z${activeProvider.minZoom}-${activeProvider.maxZoom} · live preview only`
    : "Live imagery disabled · browser map uses offline overlay only · no external tile source is requested";
  const imageryGuardrailSummary = settings.onlineImagery.enabled
    ? `${activeProvider.attribution} · ${activeProvider.licenseText} · imagery is reference-only and never canonical geometry`
    : "Imagery settings are browser-local aids; project exports keep projected/local XY geometry and exclude live tile requests.";

  useEffect(() => {
    setCustomDraft(customDraftFromSettings(settings));
    setCustomFormVisible(settings.onlineImagery.providerId === "custom_open_xyz");
  }, [settings.onlineImagery.customSource, settings.onlineImagery.providerId]);

  function update(next: Partial<AppSettings>): void {
    onChange({ ...settings, ...next });
  }

  function applyCustomSource(): void {
    if (!customValidation.ok) return;
    update({
      onlineImagery: {
        ...settings.onlineImagery,
        customSource: customValidation.source,
        enabled: true,
        providerId: "custom_open_xyz",
      },
    });
  }

  return (
    <View style={styles.shell} testID="settings-view">
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
          {ONLINE_IMAGERY_PROVIDER_LIST.map((provider) => (
            <Choice
              key={provider.id}
              active={settings.onlineImagery.enabled && settings.onlineImagery.providerId === provider.id}
              label={provider.id === "custom_open_xyz" ? "Custom open" : provider.name}
              onPress={() => {
                if (provider.id === "custom_open_xyz") {
                  setCustomFormVisible(true);
                  if (customValidation.ok) applyCustomSource();
                  return;
                }
                update({ onlineImagery: { ...settings.onlineImagery, enabled: true, providerId: provider.id } });
              }}
            />
          ))}
        </View>
        <Stepper
          label="Tile cap"
          value={`${settings.onlineImagery.maxTilesPerView}`}
          onDecrease={() => update({ onlineImagery: { ...settings.onlineImagery, maxTilesPerView: clamp(settings.onlineImagery.maxTilesPerView - 8, 8, 128) } })}
          onIncrease={() => update({ onlineImagery: { ...settings.onlineImagery, maxTilesPerView: clamp(settings.onlineImagery.maxTilesPerView + 8, 8, 128) } })}
        />
        <Text style={styles.lockedText}>
          {imagerySourceSummary}
        </Text>
        <Text style={styles.lockedText}>
          {imageryGuardrailSummary}
        </Text>
        {customFormVisible ? (
          <View style={styles.customForm}>
            <Text style={styles.lockedText}>
              Custom sources must be open, no-key XYZ or WMTS-style tile templates. Hidden keys, tokens, paid hosted imagery, and bulk caching are blocked.
            </Text>
            <SettingsInput
              label="Source name"
              value={customDraft.name}
              onChangeText={(name) => setCustomDraft((current) => ({ ...current, name }))}
            />
            <SettingsInput
              label="Tile URL"
              value={customDraft.tileUrlTemplate}
              onChangeText={(tileUrlTemplate) => setCustomDraft((current) => ({ ...current, tileUrlTemplate }))}
            />
            <View style={styles.buttonRow}>
              <Choice
                active={customDraft.tileScheme === "xyz"}
                label="XYZ"
                onPress={() => setCustomDraft((current) => ({ ...current, tileScheme: "xyz" }))}
              />
              <Choice
                active={customDraft.tileScheme === "tms"}
                label="TMS"
                onPress={() => setCustomDraft((current) => ({ ...current, tileScheme: "tms" }))}
              />
            </View>
            <View style={styles.formRow}>
              <Stepper
                label="Min zoom"
                value={`${customDraft.minZoom}`}
                onDecrease={() => setCustomDraft((current) => ({ ...current, minZoom: Math.max(0, current.minZoom - 1) }))}
                onIncrease={() => setCustomDraft((current) => ({ ...current, minZoom: Math.min(23, current.minZoom + 1) }))}
              />
              <Stepper
                label="Max zoom"
                value={`${customDraft.maxZoom}`}
                onDecrease={() => setCustomDraft((current) => ({ ...current, maxZoom: Math.max(0, current.maxZoom - 1) }))}
                onIncrease={() => setCustomDraft((current) => ({ ...current, maxZoom: Math.min(23, current.maxZoom + 1) }))}
              />
            </View>
            <SettingsInput
              label="Coverage"
              value={customDraft.coverageLabel}
              onChangeText={(coverageLabel) => setCustomDraft((current) => ({ ...current, coverageLabel }))}
            />
            <SettingsInput
              label="Attribution"
              value={customDraft.attribution}
              onChangeText={(attribution) => setCustomDraft((current) => ({ ...current, attribution }))}
            />
            <SettingsInput
              label="License"
              multiline
              value={customDraft.licenseText}
              onChangeText={(licenseText) => setCustomDraft((current) => ({ ...current, licenseText }))}
            />
            <SettingsInput
              label="Terms URL"
              value={customDraft.termsUrl ?? ""}
              onChangeText={(termsUrl) => setCustomDraft((current) => ({ ...current, termsUrl }))}
            />
            <SettingsInput
              label="Source URL"
              value={customDraft.sourceUrl ?? ""}
              onChangeText={(sourceUrl) => setCustomDraft((current) => ({ ...current, sourceUrl }))}
            />
            <Text style={[styles.validationText, customValidation.ok && styles.validationTextOk]}>
              {customValidation.ok ? "Custom source ready" : customValidation.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apply custom open imagery source"
              disabled={!customValidation.ok}
              onPress={applyCustomSource}
              style={[styles.applyButton, !customValidation.ok && styles.applyButtonDisabled]}
            >
              <Text style={styles.applyButtonText}>Apply Custom Source</Text>
            </Pressable>
          </View>
        ) : null}
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
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
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

function SettingsInput({
  label,
  multiline,
  onChangeText,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        multiline={multiline}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

type CustomImageryDraft = Omit<OnlineImageryCustomSource, "termsUrl" | "sourceUrl"> & {
  termsUrl?: string;
  sourceUrl?: string;
};

function customDraftFromSettings(settings: AppSettings): CustomImageryDraft {
  return {
    name: settings.onlineImagery.customSource?.name ?? "",
    tileUrlTemplate: settings.onlineImagery.customSource?.tileUrlTemplate ?? "",
    minZoom: settings.onlineImagery.customSource?.minZoom ?? 0,
    maxZoom: settings.onlineImagery.customSource?.maxZoom ?? 16,
    tileScheme: settings.onlineImagery.customSource?.tileScheme ?? "xyz",
    tileSize: settings.onlineImagery.customSource?.tileSize ?? 256,
    projection: "EPSG:3857",
    coverageLabel: settings.onlineImagery.customSource?.coverageLabel ?? "User-provided open imagery source",
    termsUrl: settings.onlineImagery.customSource?.termsUrl ?? "",
    sourceUrl: settings.onlineImagery.customSource?.sourceUrl ?? "",
    cachePolicy: "interactive_only",
    attribution: settings.onlineImagery.customSource?.attribution ?? "",
    licenseText: settings.onlineImagery.customSource?.licenseText ?? "",
  };
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
    flex: 1,
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
  customForm: {
    borderColor: "#dce3da",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  formRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: "#293d31",
    fontSize: 12,
    fontWeight: "900",
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#17241c",
    fontSize: 13,
    fontWeight: "700",
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  inputMultiline: {
    minHeight: 74,
    textAlignVertical: "top",
  },
  validationText: {
    color: "#8a4d1f",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  validationTextOk: {
    color: "#254234",
  },
  applyButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#254234",
    borderColor: "#254234",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  applyButtonDisabled: {
    opacity: 0.45,
  },
  applyButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
});
