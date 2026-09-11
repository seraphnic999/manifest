import { useRouter } from "expo-router";
import { colors } from "@/lib/theme";
import Icon from "@/components/icons/Icon";
import HeaderIconButton from "./HeaderIconButton";

// Pops all the way back to the trip list, however many screens deep the
// user has navigated — not just one level back. Falls back to a direct
// replace if there's nothing left to dismiss (e.g. canDismiss() is false),
// so this can never silently no-op.
export default function HomeButton() {
  const router = useRouter();
  function goHome() {
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace("/");
    }
  }
  return (
    <HeaderIconButton onPress={goHome} accessibilityLabel="Home">
      <Icon name="home" size={20} color={colors.ink} />
    </HeaderIconButton>
  );
}
