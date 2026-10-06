import { Component, type ReactNode } from "react";

type Props = { fallback: ReactNode; children: ReactNode };

/** If the Rive card throws, show the plain photo card instead of taking the page down. */
export class CardErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("Rive card failed; showing the photo card instead.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
