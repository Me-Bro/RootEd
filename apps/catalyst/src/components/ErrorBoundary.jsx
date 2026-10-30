import { Component } from 'react';
import { reportError } from '@/lib/report.js';

/** Shows `fallback` once anything below throws while rendering, and reports it. */
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportError(error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
