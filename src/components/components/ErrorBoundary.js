import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to the console
    console.error("ProdFlow Error Boundary:", error, errorInfo);
    this.setState({ error: error, errorInfo: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div style={{ padding: '50px', textAlign: 'center', color: '#a94442', backgroundColor: '#f2dede', height: '100vh', fontFamily: 'sans-serif' }}>
          <h1>¡Algo salió mal! (ProdFlow Fallback)</h1>
          <p>Se ha producido un error crítico. Por favor, revisa la consola del navegador (F12).</p>
          {this.state.error && this.state.errorInfo && (
            <details style={{ whiteSpace: 'pre-wrap', textAlign: 'left', margin: '20px auto', maxWidth: '800px', border: '1px solid #a94442', padding: '15px', backgroundColor: '#fff' }}>
              <summary>Detalles Técnicos (Copia esto)</summary>
              <p><strong>Error:</strong> {this.state.error.toString()}</p>
              <div><strong>Stack:</strong> {this.state.errorInfo.componentStack}</div>
            </details>
          )}
          <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px' }}>
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;