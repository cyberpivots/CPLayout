import { Check, CircleAlert } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  COORDINATE_FORMAT_LABELS,
  COORDINATE_FORMATS,
  CoordinateDisplayFormat,
  coordinateExample,
  formatCoordinate,
  parseCoordinateInput,
} from "@cplayout/core";
import type { LonLat, XY } from "@cplayout/core";

interface CoordinateFormatPanelProps {
  coordinate: XY;
  projectCrs: string;
  format: CoordinateDisplayFormat;
  onFormatChange: (format: CoordinateDisplayFormat) => void;
  onApply: (coordinate: XY, wgs84?: LonLat) => void;
}

export function CoordinateFormatPanel({
  coordinate,
  projectCrs,
  format,
  onFormatChange,
  onApply,
}: CoordinateFormatPanelProps): React.JSX.Element {
  const canonical = useMemo(() => ({ projected: coordinate, projectCrs }), [coordinate, projectCrs]);
  const formattedCurrent = useMemo(() => {
    try {
      return formatCoordinate(canonical, format);
    } catch {
      return formatCoordinate(canonical, "projected_local");
    }
  }, [canonical, format]);
  const [input, setInput] = useState(formattedCurrent);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => {
    setInput(formattedCurrent);
    setMessage(null);
  }, [formattedCurrent]);

  function applyCoordinate(): void {
    const parsed = parseCoordinateInput(input, format, projectCrs);
    if (!parsed.ok) {
      setMessage({ tone: "error", text: parsed.error });
      return;
    }
    onApply(parsed.coordinate.projected, parsed.coordinate.wgs84);
    setMessage({ tone: "ok", text: "Coordinate accepted." });
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Coordinate Entry</Text>
      <View style={styles.formatGrid}>
        {COORDINATE_FORMATS.map((candidate) => (
          <Pressable
            key={candidate}
            onPress={() => onFormatChange(candidate)}
            style={[styles.formatButton, candidate === format && styles.formatButtonActive]}
          >
            <Text style={[styles.formatLabel, candidate === format && styles.formatLabelActive]}>
              {COORDINATE_FORMAT_LABELS[candidate]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.inputLabel}>Pivot center</Text>
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        multiline
        onChangeText={setInput}
        placeholder={coordinateExample(format)}
        style={styles.input}
        value={input}
      />
      <View style={styles.coordinateRow}>
        <Text style={styles.exampleText}>Example: {coordinateExample(format)}</Text>
        <Pressable onPress={applyCoordinate} style={styles.applyButton}>
          <Check size={18} color="#ffffff" />
          <Text style={styles.applyText}>Apply</Text>
        </Pressable>
      </View>

      {message && (
        <View style={[styles.message, message.tone === "error" ? styles.messageError : styles.messageOk]}>
          <CircleAlert size={17} color={message.tone === "error" ? "#8b1e18" : "#1f5f39"} />
          <Text style={[styles.messageText, message.tone === "error" ? styles.messageTextError : styles.messageTextOk]}>
            {message.text}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10,
  },
  sectionTitle: {
    color: "#17241c",
    fontSize: 17,
    fontWeight: "900",
  },
  formatGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  formatButton: {
    backgroundColor: "#f1f5ee",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  formatButtonActive: {
    backgroundColor: "#254234",
    borderColor: "#254234",
  },
  formatLabel: {
    color: "#314339",
    fontSize: 12,
    fontWeight: "900",
  },
  formatLabelActive: {
    color: "#ffffff",
  },
  inputLabel: {
    color: "#293d31",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#b9c7b9",
    borderRadius: 8,
    borderWidth: 1,
    color: "#17241c",
    fontSize: 15,
    fontWeight: "700",
    minHeight: 72,
    padding: 12,
  },
  coordinateRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  exampleText: {
    color: "#5d6d62",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  applyButton: {
    alignItems: "center",
    backgroundColor: "#254234",
    borderRadius: 8,
    flexDirection: "row",
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  applyText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  message: {
    alignItems: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  messageError: {
    backgroundColor: "#fff0ee",
    borderColor: "#dfa59d",
  },
  messageOk: {
    backgroundColor: "#edf8ef",
    borderColor: "#a8d3b5",
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  messageTextError: {
    color: "#8b1e18",
  },
  messageTextOk: {
    color: "#1f5f39",
  },
});
