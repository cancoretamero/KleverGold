import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // You can also log the error to an error reporting service
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl mx-auto p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <strong>Ha ocurrido un error en la sección.</strong>
          <div className="mt-2 text-sm opacity-80">{String(this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
