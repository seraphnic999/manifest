import { useEffect, useState } from "react";
import { Modal, Pressable, Image, Text, View, StyleSheet } from "react-native";

/** Full-screen photo viewer for web — react-native-image-viewing (used by the
 * native version, PhotoLightbox.native.tsx) ships no web build at all (its
 * ImageItem component only has .ios.js/.android.js, no plain or .web.js
 * fallback), which breaks Metro's web bundle outright. This is a plain,
 * dependency-free stand-in: no pinch-zoom, just a centered full-screen image
 * with prev/next and a close button — every Doc Tracker photo surface still
 * works on web, just without the zoom gesture. */
export default function PhotoLightbox({
  urls, initialIndex = 0, visible, onClose,
}: {
  urls: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(urls.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose, urls.length]);

  if (!urls.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.imageWrap} onPress={(e) => e.stopPropagation()}>
          <Image source={{ uri: urls[index] }} style={styles.image} resizeMode="contain" />
        </Pressable>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {urls.length > 1 && (
          <>
            <Pressable
              style={[styles.navBtn, styles.navLeft]}
              onPress={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
              hitSlop={12}
            >
              <Text style={styles.navText}>‹</Text>
            </Pressable>
            <Pressable
              style={[styles.navBtn, styles.navRight]}
              onPress={(e) => { e.stopPropagation(); setIndex((i) => Math.min(urls.length - 1, i + 1)); }}
              hitSlop={12}
            >
              <Text style={styles.navText}>›</Text>
            </Pressable>
            <Text style={styles.counter}>{index + 1} / {urls.length}</Text>
          </>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: "90%",
    height: "85%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    top: 24,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#fff",
    fontSize: 20,
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  navLeft: { left: 16 },
  navRight: { right: 16 },
  navText: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 30,
  },
  counter: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    color: "#fff",
    fontSize: 14,
    opacity: 0.8,
  },
});
