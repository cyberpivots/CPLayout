import { Check, CheckSquare, Clipboard, Copy, FileDown, MapPinned, MousePointer2, Square, Upload } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

const addMenuScreenshot = require("../assets/google-earth-wizard/google-earth-pro-add-menu.png") as ImageSourcePropType;
const mainWindowScreenshot = require("../assets/google-earth-wizard/google-earth-pro-main-window.png") as ImageSourcePropType;

interface WizardStep {
  title: string;
  icon: React.JSX.Element;
  screenshot?: ImageSourcePropType;
  bullets: string[];
  examples: string[];
}

const WIZARD_STEPS: WizardStep[] = [
  {
    title: "1. Pick importable features",
    icon: <MapPinned size={17} color="#254234" />,
    screenshot: mainWindowScreenshot,
    bullets: [
      "CPLayout imports a field boundary, obstacle polygons, survey points, and utility point or line map features.",
      "Use KML/KMZ as WGS84 exchange only; imported geometry is reviewed before it is projected into the project CRS.",
      "Leave overlays, tours, 3D models, and style-only items out of the import package.",
    ],
    examples: ["field_boundary", "survey_point", "pump_location"],
  },
  {
    title: "2. Draw the field boundary",
    icon: <MousePointer2 size={17} color="#254234" />,
    screenshot: addMenuScreenshot,
    bullets: [
      "In Google Earth Pro, use Add > Polygon for the field outline.",
      "Click around the irrigated field edge, close the polygon, and save it with a boundary name.",
      "Only one selected boundary is applied; a selected boundary replaces the current CPLayout field boundary.",
    ],
    examples: ["field_boundary", "Boundary"],
  },
  {
    title: "3. Draw obstacle polygons",
    icon: <MousePointer2 size={17} color="#254234" />,
    screenshot: addMenuScreenshot,
    bullets: [
      "Use Add > Polygon for areas the pivot must avoid or treat as a hard conflict.",
      "Name each polygon with the obstacle kind CPLayout should assign.",
      "Inner rings are ignored by the current importer, so draw separate polygons instead of holes.",
    ],
    examples: ["road", "ditch", "fence", "building", "canal", "tree", "exclusion"],
  },
  {
    title: "4. Mark utilities and limits",
    icon: <MousePointer2 size={17} color="#254234" />,
    screenshot: addMenuScreenshot,
    bullets: [
      "Use Add > Path for lines such as pipelines, power lines, access lanes, arcs, and swing limits.",
      "Use Add > Placemark for point features such as pump locations, power poles, and notes.",
      "CPLayout keeps these as selectable map features separate from field and obstacle geometry.",
    ],
    examples: ["underground_pipeline", "power_line", "power_pole", "pump_location", "access_lane", "end_gun_arc", "corner_swing_limit"],
  },
  {
    title: "5. Save KML or KMZ",
    icon: <FileDown size={17} color="#254234" />,
    screenshot: mainWindowScreenshot,
    bullets: [
      "Save the folder or selected places from Google Earth Pro as KML or KMZ.",
      "Use KMZ when Google Earth creates an archive; CPLayout expects one KML document inside the KMZ.",
      "Keep the import package focused on the field, obstacles, survey points, and utility features intended for CPLayout.",
    ],
    examples: ["project-field.kml", "project-field.kmz"],
  },
  {
    title: "6. Review before applying",
    icon: <Upload size={17} color="#254234" />,
    bullets: [
      "Press Import KML/KMZ, inspect every review card, and deselect anything that should not change the project.",
      "Apply only the intended cards; the review summary lists boundary, obstacle, survey point, map feature, and skipped counts.",
      "Cancel the review to leave the current project unchanged.",
    ],
    examples: ["select Boundary", "select underground_pipeline", "deselect extra notes"],
  },
];

const READY_CHECKLIST = [
  "Boundary polygon is named field_boundary or Boundary.",
  "Obstacle polygons use road, ditch, fence, building, canal, tree, or exclusion.",
  "Utility paths and placemarks use CPLayout names.",
  "KML/KMZ contains only intended field data.",
  "Review cards will be selected one by one before Apply Import.",
];

export function GoogleEarthImportWizard(): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [copiedExample, setCopiedExample] = useState<string | null>(null);
  const step = WIZARD_STEPS[stepIndex];
  const progressText = `${completedSteps.length}/${WIZARD_STEPS.length}`;
  const checklist = useMemo(() => READY_CHECKLIST.map((item, index) => ({
    item,
    complete: index < Math.min(completedSteps.length, READY_CHECKLIST.length),
  })), [completedSteps.length]);

  function toggleStepComplete(): void {
    setCompletedSteps((current) =>
      current.includes(stepIndex)
        ? current.filter((candidate) => candidate !== stepIndex)
        : [...current, stepIndex],
    );
  }

  function copyExample(example: string): void {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard) {
      void clipboard.writeText(example).catch(() => undefined);
    }
    setCopiedExample(example);
  }

  function goToStep(index: number): void {
    setStepIndex(Math.max(0, Math.min(WIZARD_STEPS.length - 1, index)));
  }

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Clipboard size={18} color="#254234" />
          <View>
            <Text style={styles.title}>Google Earth Import Wizard</Text>
            <Text style={styles.subtitle}>Interactive KML/KMZ trainer</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} style={styles.toggleButton}>
          <Text style={styles.toggleButtonText}>{open ? "Close" : "Open"}</Text>
        </Pressable>
      </View>

      {open ? (
        <View style={styles.body}>
          <View style={styles.progressRow}>
            {WIZARD_STEPS.map((wizardStep, index) => {
              const active = index === stepIndex;
              const complete = completedSteps.includes(index);
              return (
                <Pressable
                  accessibilityLabel={wizardStep.title}
                  accessibilityRole="button"
                  key={wizardStep.title}
                  onPress={() => goToStep(index)}
                  style={[styles.stepDot, active && styles.stepDotActive, complete && styles.stepDotComplete]}
                >
                  <Text style={[styles.stepDotText, (active || complete) && styles.stepDotTextActive]}>{index + 1}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.progressText}>{progressText} complete</Text>
          </View>

          <View style={styles.stepBox}>
            <View style={styles.stepTitleRow}>
              {step.icon}
              <Text style={styles.stepTitle}>{step.title}</Text>
            </View>
            {step.screenshot ? (
              <Image resizeMode="cover" source={step.screenshot} style={styles.screenshot} />
            ) : null}
            {step.bullets.map((bullet) => (
              <Text key={bullet} style={styles.bulletText}>- {bullet}</Text>
            ))}
            <View style={styles.exampleGrid}>
              {step.examples.map((example) => (
                <Pressable accessibilityLabel={`Copy ${example}`} key={example} onPress={() => copyExample(example)} style={styles.exampleToken}>
                  <Copy size={13} color="#254234" />
                  <Text style={styles.exampleText}>{example}</Text>
                </Pressable>
              ))}
            </View>
            {copiedExample ? (
              <Text style={styles.copyStatus}>Copied: {copiedExample}</Text>
            ) : null}
          </View>

          <View style={styles.navigationRow}>
            <Pressable accessibilityRole="button" disabled={stepIndex === 0} onPress={() => goToStep(stepIndex - 1)} style={[styles.navButton, stepIndex === 0 && styles.navButtonDisabled]}>
              <Text style={[styles.navButtonText, stepIndex === 0 && styles.navButtonTextDisabled]}>Back</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={toggleStepComplete} style={styles.doneButton}>
              {completedSteps.includes(stepIndex) ? <CheckSquare size={16} color="#ffffff" /> : <Square size={16} color="#ffffff" />}
              <Text style={styles.doneButtonText}>Step Ready</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={stepIndex === WIZARD_STEPS.length - 1} onPress={() => goToStep(stepIndex + 1)} style={[styles.navButton, stepIndex === WIZARD_STEPS.length - 1 && styles.navButtonDisabled]}>
              <Text style={[styles.navButtonText, stepIndex === WIZARD_STEPS.length - 1 && styles.navButtonTextDisabled]}>Next</Text>
            </Pressable>
          </View>

          <View style={styles.checklistBox}>
            <Text style={styles.checklistTitle}>Ready To Import</Text>
            {checklist.map((check) => (
              <View key={check.item} style={styles.checkRow}>
                {check.complete ? <Check size={14} color="#1f5f39" /> : <Square size={14} color="#6a766d" />}
                <Text style={styles.checkText}>{check.item}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.closedText}>Guides Google Earth Pro drawing names, KML/KMZ export, and review-card selection.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderColor: "#d8e0d4",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 360,
    flexGrow: 1,
    gap: 10,
    padding: 12,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: "#17241c",
    fontSize: 14,
    fontWeight: "900",
  },
  subtitle: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  toggleButton: {
    backgroundColor: "#edf4eb",
    borderColor: "#c4d4c3",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toggleButtonText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
  },
  body: {
    gap: 10,
  },
  progressRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  stepDot: {
    alignItems: "center",
    backgroundColor: "#f8faf4",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  stepDotActive: {
    backgroundColor: "#e9f1e7",
    borderColor: "#254234",
  },
  stepDotComplete: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  stepDotText: {
    color: "#405146",
    fontSize: 12,
    fontWeight: "900",
  },
  stepDotTextActive: {
    color: "#ffffff",
  },
  progressText: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 4,
  },
  stepBox: {
    gap: 8,
  },
  stepTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  stepTitle: {
    color: "#17241c",
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  screenshot: {
    aspectRatio: 3.45,
    backgroundColor: "#0c100e",
    borderColor: "#d8e0d4",
    borderRadius: 8,
    borderWidth: 1,
    width: "100%",
  },
  bulletText: {
    color: "#26372c",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  exampleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  exampleToken: {
    alignItems: "center",
    backgroundColor: "#f8faf4",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  exampleText: {
    color: "#254234",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "800",
  },
  copyStatus: {
    color: "#1f5f39",
    fontSize: 12,
    fontWeight: "800",
  },
  navigationRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  navButton: {
    alignItems: "center",
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navButtonText: {
    color: "#254234",
    fontSize: 12,
    fontWeight: "900",
  },
  navButtonTextDisabled: {
    color: "#6a766d",
  },
  doneButton: {
    alignItems: "center",
    backgroundColor: "#254234",
    borderColor: "#254234",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  checklistBox: {
    backgroundColor: "#f8faf4",
    borderColor: "#d8e0d4",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  checklistTitle: {
    color: "#405146",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  checkRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 7,
  },
  checkText: {
    color: "#26372c",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  closedText: {
    color: "#53655a",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
});
