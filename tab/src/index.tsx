import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import "./index.css";
import { App } from "./App";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#dc2626" }}>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 8, color: "#666" }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
