import { Component, ReactNode } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";
import { queryClient } from "@/lib/queryClient";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Last-resort catch for a render-time crash anywhere in the app. Without
 * this, an uncaught error in a screen's render (rather than an async/network
 * error, which each screen already handles on its own) unmounts the whole
 * RN tree and the app just disappears — no way for a user to tell us what
 * broke. This shows the actual error + component stack instead, so a
 * "silent crash" report can turn into an actionable one.
 *
 * Deliberately NOT wired to dark mode: a React error boundary must be a
 * class component (no hooks), and this is the one screen that needs to
 * render correctly even if the crash it's catching somehow originated
 * inside ThemeProvider's own subtree — a fixed light appearance here is a
 * reasonable trade for that robustness on a screen nobody sees in normal
 * operation. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>{this.state.error.message}</Text>
            <Text style={styles.stack}>{this.state.error.stack}</Text>
          </ScrollView>
          <Pressable
            style={styles.button}
            onPress={() => {
              // A render crash here is most often a bad *cached* value (a
              // stale persisted react-query entry shaped wrong for what the
              // current screen reads — see lib/queryClient.ts) rather than a
              // one-off fluke, so just clearing this boundary's error and
              // re-rendering would hand the exact same bad value straight
              // back to the same crash. Clearing the query cache first means
              // every mounted screen re-fetches from the network instead of
              // replaying whatever local state caused this.
              queryClient.clear();
              this.setState({ error: null });
            }}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingTop: 60 },
  scroll: { padding: 20 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, marginBottom: 10 },
  message: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.coral, marginBottom: 14 },
  stack: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft },
  button: {
    backgroundColor: colors.ink, borderRadius: radius.md, padding: 14,
    alignItems: "center", margin: 20,
  },
  buttonText: { color: colors.paper, fontWeight: "700" },
});
