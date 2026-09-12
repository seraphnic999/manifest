import { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, Image } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as ImageManipulator from "expo-image-manipulator";
import { colors, radius, fonts } from "@/lib/theme";

// Lets the user pick which square section of a picked photo shows inside
// the circular avatar — this doesn't touch the original photo, it just
// crops+resizes a copy of it to whatever the user framed in the box.
const BOX = 280;
const MIN_SCALE = 1;
const MAX_SCALE = 3.5;

interface Props {
  visible: boolean;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
}

export default function AvatarCropModal({ visible, imageUri, imageWidth, imageHeight, onCancel, onConfirm }: Props) {
  const baseScale = BOX / Math.min(imageWidth, imageHeight);

  const [scale, setScale] = useState(MIN_SCALE);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [saving, setSaving] = useState(false);

  const startScale = useRef(1);
  const startX = useRef(0);
  const startY = useRef(0);

  function clamp(total: number, dim: number, t: number) {
    const displayed = dim * baseScale * total;
    const max = Math.max(0, (displayed - BOX) / 2);
    return Math.min(max, Math.max(-max, t));
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => { startX.current = translateX; startY.current = translateY; })
    .onUpdate((e) => {
      setTranslateX(clamp(scale, imageWidth, startX.current + e.translationX));
      setTranslateY(clamp(scale, imageHeight, startY.current + e.translationY));
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => { startScale.current = scale; })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, startScale.current * e.scale));
      setScale(next);
      setTranslateX((x) => clamp(next, imageWidth, x));
      setTranslateY((y) => clamp(next, imageHeight, y));
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  async function confirm() {
    setSaving(true);
    try {
      const totalScale = baseScale * scale;
      const cropSize = BOX / totalScale;
      let originX = imageWidth / 2 - cropSize / 2 - translateX / totalScale;
      let originY = imageHeight / 2 - cropSize / 2 - translateY / totalScale;
      originX = Math.min(Math.max(originX, 0), Math.max(0, imageWidth - cropSize));
      originY = Math.min(Math.max(originY, 0), Math.max(0, imageHeight - cropSize));

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ crop: { originX, originY, width: cropSize, height: cropSize } }, { resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      onConfirm(result.uri);
    } finally {
      setSaving(false);
    }
  }

  const imgStyle = {
    width: imageWidth * baseScale * scale,
    height: imageHeight * baseScale * scale,
    transform: [{ translateX }, { translateY }],
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Text style={styles.title}>Position photo</Text>
        <Text style={styles.hint}>Drag and pinch to frame what shows in the circle</Text>
        <GestureDetector gesture={gesture}>
          <View style={styles.box}>
            <Image source={{ uri: imageUri }} style={imgStyle} />
            <View pointerEvents="none" style={styles.ringOverlay} />
          </View>
        </GestureDetector>
        <View style={styles.actions}>
          <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.confirmBtn, saving && { opacity: 0.6 }]} onPress={confirm} disabled={saving}>
            <Text style={styles.confirmText}>{saving ? "Saving…" : "Use photo"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,16,24,0.92)", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontFamily: fonts.display, fontSize: 18, marginBottom: 4 },
  hint: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 20 },
  box: {
    width: BOX, height: BOX, borderRadius: radius.lg, overflow: "hidden",
    backgroundColor: "#000", alignItems: "center", justifyContent: "center",
  },
  ringOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: BOX / 2, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)",
  },
  actions: { flexDirection: "row", gap: 14, marginTop: 26 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  cancelText: { color: "rgba(255,255,255,0.8)", fontWeight: "600", fontSize: 15 },
  confirmBtn: { backgroundColor: colors.blue, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 22 },
  confirmText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
