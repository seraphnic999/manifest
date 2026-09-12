import { Component, ReactNode } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { colors, radius, fonts } from "@/lib/theme";

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
 * "silent crash" report can turn into an actionable one. */
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
          <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
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
