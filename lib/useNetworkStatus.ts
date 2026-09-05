import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/** True unless NetInfo has positively confirmed there's no connection. */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setIsOnline(state.isConnected !== false));
    return unsubscribe;
  }, []);
  return isOnline;
}
