import { Component, ReactNode } from 'react';
import DevConsole from './DevConsole';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">Что-то пошло не так</h2>
            <p className="text-gray-500 mb-4">Произошла ошибка при загрузке приложения</p>
            {this.state.error?.message && (
              <div className="mb-4 rounded-xl bg-white/5 border border-white/10 text-left p-3">
                <p className="text-xs uppercase tracking-wide text-white/40 mb-1">Описание ошибки</p>
                <pre className="text-sm text-red-600 whitespace-pre-wrap break-words font-mono">
                  {this.state.error.message}
                </pre>
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Перезагрузить страницу
            </button>
          </div>
          <DevConsole />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
