import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected runtime error occurred.',
    };
  }

  public componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Handled gracefully by the fallback UI; avoid noisy console dumps in production.
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-b from-[#a7d6f8] to-[#f4ece2] p-6 text-slate-900">
          <div className="w-full max-w-md rounded-2xl border border-slate-900/12 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1
              className="mt-3 text-2xl font-bold tracking-tight text-slate-950"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Wobblepeak hit a snag
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {this.state.errorMessage ?? 'Something interrupted the 3D scene.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Your campaign progress and settings are safely stored in your browser.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reload Wobblepeak</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
