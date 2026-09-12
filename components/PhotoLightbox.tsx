import ImageViewing from "react-native-image-viewing";

/** Full-screen pinch-to-zoom photo viewer — thin wrapper around
 * react-native-image-viewing so every photo surface in Doc Tracker
 * (profile photo, additional photos, a document's scan) opens the same way. */
export default function PhotoLightbox({
  urls, initialIndex = 0, visible, onClose,
}: {
  urls: string[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ImageViewing
      images={urls.map((uri) => ({ uri }))}
      imageIndex={initialIndex}
      visible={visible}
      onRequestClose={onClose}
    />
  );
}
