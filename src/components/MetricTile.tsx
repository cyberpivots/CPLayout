import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface MetricTileProps {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}

export function MetricTile({ label, value, tone = "neutral" }: MetricTileProps): React.JSX.Element {
  return (
    <View style={[styles.tile, styles[tone]]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderColor: "#d7ded7",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: 142,
    flexGrow: 1,
    gap: 4,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  neutral: {
    backgroundColor: "#f8faf8",
  },
  good: {
    backgroundColor: "#eef8f1",
    borderColor: "#a8d7b4",
  },
  warn: {
    backgroundColor: "#fff8e5",
    borderColor: "#e2c46c",
  },
  danger: {
    backgroundColor: "#fff0ec",
    borderColor: "#e9a08c",
  },
  value: {
    color: "#14231a",
    fontSize: 22,
    fontWeight: "800",
  },
  label: {
    color: "#58665d",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
