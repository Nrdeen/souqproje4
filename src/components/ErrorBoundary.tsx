import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ui] Unhandled application error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 p-6 text-stone-900 dark:text-stone-100"
        >
          <div className="max-w-md w-full rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 shadow-sm text-center space-y-4">
            <h1 className="text-xl font-bold">حدث خطأ غير متوقع في عرض الصفحة</h1>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              نعتذر عن هذا الخلل المؤقت. يرجى تحديث الصفحة للمتابعة بأمان.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer"
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
