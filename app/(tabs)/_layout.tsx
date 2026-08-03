import { Tabs } from "expo-router";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.paperRaised, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Trips" }} />
      <Tabs.Screen name="types" options={{ title: "Types" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      <Tabs.Screen name="shop" options={{ title: "Shop" }} />
    </Tabs>
  );
}
