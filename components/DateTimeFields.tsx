import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius } from "@/lib/theme";

function webStyle(extra = {}) {
  return {
    backgroundColor: colors.paperRaised, border: `1px solid ${colors.line}`,
    borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
    width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit", ...extra,
  };
}

const labelStyle = {
  color: colors.inkSoft, fontSize: 12, fontWeight: "600" as const,
  marginTop: 16, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.5,
};
const inputStyle = {
  backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
  borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.ink,
};

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Text style={labelStyle}>{label}</Text>
        {/* @ts-ignore */}
        <input type="date" value={value} onChange={(e: any) => onChange(e.target.value)} style={webStyle()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={labelStyle}>{label}</Text>
      <Pressable style={inputStyle} onPress={() => setShow(true)}>
        <Text style={{ color: value ? colors.ink : colors.inkSoft }}>{value || "Select date"}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          onChange={(_, d) => { setShow(false); if (d) onChange(d.toISOString().slice(0, 10)); }}
        />
      )}
    </View>
  );
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Text style={labelStyle}>{label}</Text>
        {/* @ts-ignore */}
        <input type="time" value={value} onChange={(e: any) => onChange(e.target.value)} style={webStyle()} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={labelStyle}>{label}</Text>
      <Pressable style={inputStyle} onPress={() => setShow(true)}>
        <Text style={{ color: value ? colors.ink : colors.inkSoft }}>{value || "Optional"}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={value ? new Date(`1970-01-01T${value}`) : new Date()}
          mode="time"
          onChange={(_, d) => { setShow(false); if (d) onChange(d.toTimeString().slice(0, 5)); }}
        />
      )}
    </View>
  );
}
