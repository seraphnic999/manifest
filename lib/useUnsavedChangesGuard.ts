import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";

// Standard React Navigation pattern for "prevent leaving with unsaved
// changes" (their docs call this out specifically — the beforeRemove event
// fires for back button/gesture AND for router.replace/dismiss-style calls,
// since they all remove this screen from the stack the same way).
export function useUnsavedChangesGuard(isDirty: () => boolean) {
  const navigation = useNavigation();
  const [pendingAction, setPendingAction] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove" as any, (e: any) => {
      if (!isDirty()) return;
      e.preventDefault();
      setPendingAction(e.data.action);
    });
    return unsubscribe;
  }, [navigation]);

  return {
    promptVisible: !!pendingAction,
    proceed: () => {
      if (pendingAction) navigation.dispatch(pendingAction);
      setPendingAction(null);
    },
    cancel: () => setPendingAction(null),
  };
}
