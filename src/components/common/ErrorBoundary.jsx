import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          textAlign: 'center',
          background: 'var(--bg-main)',
          color: 'var(--text-primary)'
        }}>
          <FaExclamationTriangle style={{ fontSize: '48px', color: '#ef4444', marginBottom: '16px' }} />
          <h1 style={{ marginBottom: '16px' }}>Something went wrong.</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', maxWidth: '500px' }}>
            We're sorry, but an unexpected error occurred while loading this page. 
            Please try refreshing or navigating back.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginTop: '32px', textAlign: 'left', background: 'var(--bg-nested)', padding: '16px', borderRadius: '8px', width: '100%', maxWidth: '800px', overflowX: 'auto' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px' }}>Error Details (Dev Only)</summary>
              <pre style={{ color: '#ef4444', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
                <br />
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
