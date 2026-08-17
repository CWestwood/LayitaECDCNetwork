import { Component } from 'react';
import type { ErrorInfo, PropsWithChildren, ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-error" role="alert">
        <div className="app-error__card">
          <h1>Something went wrong</h1>
          <p>The page could not be displayed. Your data has not been changed.</p>
          <details>
            <summary>Technical details</summary>
            <pre>{this.state.error.message}</pre>
          </details>
          <button type="button" onClick={() => window.location.reload()}>Reload application</button>
        </div>
      </main>
    );
  }
}
