import { Component, type ErrorInfo, type ReactNode } from 'react';
import './error-boundary.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Addition 1 (task-15-brief Context): routing makes three screens reachable
 * that call thetaToScore (src/engines/theta.ts) during render, and it throws
 * on non-finite input. ProgressScreen, PlacementScreen and SimulationScreen
 * each already guard that specific, anticipated throw themselves - a
 * describe*Score helper computed ahead of the JSX in a try/catch, so a
 * failure is a value the render branches on rather than an exception that
 * kills the render (see describeProgressScore / describePlacementScore /
 * describeSimulationScore). This boundary is not a replacement for that: it
 * is the general backstop underneath it, for whatever is NOT yet guarded
 * that way - a future screen, a regression, or any other unanticipated
 * render-phase throw - so the result is a visible, accessible notice
 * instead of an uncaught exception unmounting the tree into a blank page
 * with nothing for a screen reader to announce.
 *
 * A class component because React only exposes getDerivedStateFromError /
 * componentDidCatch on the class API - there is no hook equivalent.
 *
 * Note on scope: this catches render-phase throws only, per React's error
 * boundary contract - not promise rejections and not throws inside effects
 * or event handlers. Addition 1's other half (TodayScreen.start()'s
 * Promise.all, and App.tsx's own initial getProfile() read) is a *load*
 * failure, not a render throw, so it is guarded separately with its own
 * try/catch and its own visible role="status" notice, matching the pattern
 * already established in SessionRunner for save failures.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <p className="save-error" role="status" aria-label="שגיאה בלתי צפויה">
          <span className="save-error-glyph" aria-hidden="true">
            ✕
          </span>
          משהו השתבש בטעינת המסך. אפשר לעבור ללשונית אחרת או לרענן את העמוד.
        </p>
      );
    }
    return this.props.children;
  }
}
