import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Platform, TextInput } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius } from "@/lib/theme";
import { formatDateDDMMYYYY } from "@/lib/dateFormat";
import { normalizeTimeHHMM } from "@/lib/timeFormat";

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
  const [focused, setFocused] = useState(false);
  if (Platform.OS === "web") {
    // The native <input type="date"> stays fully functional (including its
    // calendar picker) at all times — the HTML `lang` attribute turned out
    // not to control its display format in Chromium (tested directly:
    // en-GB/de-DE/fr all still rendered mm/dd/yyyy + AM/PM here), so there's
    // no way to force dd/mm/yyyy on the native rendering itself. Instead,
    // the dd/mm/yyyy label only covers the input while it's NOT focused;
    // while actively typing, the real input shows through normally (in
    // whatever format the browser gives) so keystrokes are always visible,
    // then it snaps back to dd/mm/yyyy on blur.
    return (
      <View style={{ flex: 1 }}>
        <Text style={labelStyle}>{label}</Text>
        <View style={{ position: "relative" }}>
          {/* @ts-ignore */}
          <input
            type="date"
            value={value}
            onChange={(e: any) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={webStyle({ color: focused ? colors.ink : "transparent" })}
          />
          {!focused && (
            <View style={webOverlayStyle}>
              <Text style={{ color: value ? colors.ink : colors.inkSoft, fontSize: 15 }}>
                {formatDateDDMMYYYY(value) || "dd/mm/yyyy"}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={labelStyle}>{label}</Text>
      <Pressable style={inputStyle} onPress={() => setShow(true)}>
        <Text style={{ color: value ? colors.ink : colors.inkSoft }}>{formatDateDDMMYYYY(value) || "Select date"}</Text>
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

const webOverlayStyle = {
  position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0,
  paddingHorizontal: 12, justifyContent: "center" as const,
  pointerEvents: "none" as const,
};

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const displayValue = normalizeTimeHHMM(value);
  if (Platform.OS === "web") {
    // Not a native <input type="time"> — that hid its own text behind a
    // transparent-color + overlay trick to force 24-hour "HH:MM", but
    // browsers override text color during selection/focus (leaking the
    // locale's real AM/PM text through) and typed digits went into the
    // hidden input invisibly until a full value committed. Two plain,
    // fully-visible digit boxes sidestep both: nothing hidden, nothing to leak.
    return <WebTimeSegments label={label} value={displayValue} onChange={onChange} />;
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={labelStyle}>{label}</Text>
      <Pressable style={inputStyle} onPress={() => setShow(true)}>
        <Text style={{ color: value ? colors.ink : colors.inkSoft }}>{displayValue || "Optional"}</Text>
      </Pressable>
      {show && (
        <DateTimePicker
          value={value ? new Date(`1970-01-01T${displayValue}`) : new Date()}
          mode="time"
          is24Hour
          onChange={(_, d) => { setShow(false); if (d) onChange(d.toTimeString().slice(0, 5)); }}
        />
      )}
    </View>
  );
}

// Clamp only once a full 2-digit value is in — mid-typing a lone digit like
// "0" (of an intended "09") can't be out of range yet, so leave it alone
// rather than reformatting and stripping the leading zero back off.
function clampDigits(digits: string, max: number): string {
  if (digits.length < 2) return digits;
  const n = parseInt(digits, 10);
  return n > max ? String(max) : digits;
}

function WebTimeSegments({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [hh, setHh] = useState(() => value.split(":")[0] ?? "");
  const [mm, setMm] = useState(() => value.split(":")[1] ?? "");
  const mmRef = useRef<TextInput>(null);

  // Resync if the value changes from outside (e.g. switching to a different item).
  useEffect(() => {
    const [h, m] = value ? value.split(":") : ["", ""];
    setHh(h ?? "");
    setMm(m ?? "");
  }, [value]);

  function commit(newHh: string, newMm: string) {
    if (newHh.length === 2 && newMm.length === 2) onChange(`${newHh}:${newMm}`);
    else if (newHh === "" && newMm === "") onChange("");
  }

  function handleHhChange(text: string) {
    const digits = clampDigits(text.replace(/\D/g, "").slice(0, 2), 23);
    setHh(digits);
    commit(digits, mm);
    // Deferred: focusing mm synchronously here blurs the hour input before
    // React has committed the "digits" state update above — the blur
    // handler's closure would still see the OLD (1-digit) hh and wrongly
    // re-pad it, stomping the digit that was just typed. Deferring past
    // the current tick lets the state update land first.
    if (digits.length === 2) setTimeout(() => mmRef.current?.focus(), 0);
  }

  function handleMmChange(text: string) {
    const digits = clampDigits(text.replace(/\D/g, "").slice(0, 2), 59);
    setMm(digits);
    commit(hh, digits);
  }

  function handleHhBlur() {
    if (hh.length === 1) { const padded = "0" + hh; setHh(padded); commit(padded, mm); }
  }
  function handleMmBlur() {
    if (mm.length === 1) { const padded = "0" + mm; setMm(padded); commit(hh, padded); }
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={labelStyle}>{label}</Text>
      <View style={timeSegmentBoxStyle}>
        <TextInput
          style={timeSegmentInputStyle}
          value={hh}
          onChangeText={handleHhChange}
          onBlur={handleHhBlur}
          placeholder="--"
          placeholderTextColor={colors.inkSoft}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Text style={{ color: colors.inkSoft, fontSize: 15 }}>:</Text>
        <TextInput
          ref={mmRef}
          style={timeSegmentInputStyle}
          value={mm}
          onChangeText={handleMmChange}
          onBlur={handleMmBlur}
          placeholder="--"
          placeholderTextColor={colors.inkSoft}
          keyboardType="number-pad"
          maxLength={2}
        />
      </View>
    </View>
  );
}

const timeSegmentBoxStyle = {
  flexDirection: "row" as const, alignItems: "center" as const, gap: 4,
  backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line,
  borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
};
const timeSegmentInputStyle = {
  width: 24, fontSize: 15, color: colors.ink, textAlign: "center" as const, padding: 0,
};
