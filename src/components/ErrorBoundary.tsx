import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in MIDI Harmony Inspector:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      const isDev = (import.meta as any).env?.DEV;

      return (
        <div className="h-screen w-screen bg-[#121316] text-slate-200 flex flex-col items-center justify-center p-6 select-none font-sans">
          <div className="bg-[#1c1e22] border border-rose-500/50 rounded-2xl p-8 max-w-xl w-full shadow-2xl text-center">
            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              画面表示中に予期せぬエラーが発生しました
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              UIのレンダリング中に問題が発生しました。アプリケーションを再読み込みするか、セッションのリセットをお試しください。
            </p>

            <div className="flex items-center justify-center gap-3 mb-6">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 shadow-md shadow-rose-950/50 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>アプリを再読み込み</span>
              </button>
              <button
                onClick={this.handleResetState}
                className="px-4 py-2 rounded-lg bg-[#272a30] hover:bg-[#32363e] text-slate-300 text-xs font-medium border border-[#3c404a] transition"
              >
                閉じて再試行
              </button>
            </div>

            {isDev && this.state.error && (
              <div className="text-left bg-[#141518] p-4 rounded-lg border border-[#2e3238] overflow-x-auto text-[11px] font-mono text-rose-300 max-h-48">
                <p className="font-bold mb-1">{this.state.error.toString()}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-slate-500 whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
