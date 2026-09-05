import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { getUserInfo } from '../../utils/tokenStorage';

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
      const user = getUserInfo();
      const isAdmin = user && (user.role === 'ADMIN' || user.is_superuser);
      
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
          
          {this.state.error && isAdmin && (
            <div style={{ marginTop: '32px', textAlign: 'left', background: 'var(--bg-nested)', padding: '16px', borderRadius: '8px', width: '100%', maxWidth: '800px', overflowX: 'auto' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ef4444' }}>Error Details (Admin Only)</div>
              <pre style={{ color: '#ef4444', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
                <br />
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
          )}

          {this.state.error && !isAdmin && !this.state.showDetails && !this.state.showAdminLogin && (
            <button 
              onClick={() => this.setState({ showAdminLogin: true })}
              style={{
                marginTop: '32px',
                padding: '8px 16px',
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              View Error Details (Admin Override)
            </button>
          )}

          {this.state.showAdminLogin && !this.state.showDetails && (
            <div style={{ marginTop: '32px', textAlign: 'left', background: 'var(--bg-nested)', padding: '16px', borderRadius: '8px', width: '100%', maxWidth: '300px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '16px', color: 'var(--text-primary)' }}>Admin Override</div>
              <input 
                type="email" 
                id="admin_override_email"
                placeholder="Admin Email" 
                style={{ width: '100%', padding: '8px', marginBottom: '8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} 
              />
              <input 
                type="password" 
                id="admin_override_password"
                placeholder="Password" 
                style={{ width: '100%', padding: '8px', marginBottom: '16px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} 
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={async () => {
                    const email = document.getElementById('admin_override_email').value;
                    const password = document.getElementById('admin_override_password').value;
                    if (!email || !password) return alert("Enter email and password.");
                    try {
                      const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/auth/token/`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password })
                      });
                      const data = await res.json();
                      if (data.access) {
                        const { parseJwt } = await import('../../utils/tokenStorage');
                        const decoded = parseJwt(data.access);
                        if (decoded?.role === 'ADMIN' || decoded?.is_superuser) {
                          this.setState({ showDetails: true, showAdminLogin: false });
                        } else {
                          alert("Account is not an Admin.");
                        }
                      } else {
                        alert("Invalid credentials.");
                      }
                    } catch (e) {
                      alert("Error connecting to server.");
                    }
                  }}
                  style={{ flex: 1, padding: '8px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Verify
                </button>
                <button 
                  onClick={() => this.setState({ showAdminLogin: false })}
                  style={{ flex: 1, padding: '8px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {this.state.showDetails && (
            <div style={{ marginTop: '32px', textAlign: 'left', background: 'var(--bg-nested)', padding: '16px', borderRadius: '8px', width: '100%', maxWidth: '800px', overflowX: 'auto' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ef4444' }}>Error Details (Admin Override)</div>
              <pre style={{ color: '#ef4444', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
                <br />
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
