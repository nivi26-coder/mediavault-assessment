import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Shown in the fallback UI so different boundaries can say what actually
  // broke ("the asset grid," "the detail panel") instead of a generic message.
  label: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a crash in one part of the tree (a bad render, a thrown error in a
 * component) from blanking the whole page. Scoped around individual
 * sections (the grid, the detail panel) rather than once around the whole
 * app, so a failure in one doesn't take out parts of the page that still
 * work fine.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Unhandled error in ${this.props.label}:`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="errorBoundary" role="alert">
          <p>Something went wrong in {this.props.label}.</p>
          <button onClick={this.reset}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
