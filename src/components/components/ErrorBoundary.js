// Ruta: src/components/ErrorBoundary.js

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Actualiza el estado para que el siguiente renderizado muestre la UI de fallback.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // También puedes registrar el error en un servicio de reporte de errores
    console.error("Error no detectado capturado por ErrorBoundary:", error, errorInfo);
    this.setState({ error: error, errorInfo: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // Puedes renderizar cualquier UI de fallback que quieras
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 max-w-lg text-center">
            <h1 className="text-2xl font-bold mb-4">Algo salió muy mal.</h1>
            <p className="mb-4">
              La aplicación encontró un error inesperado. Por favor, refresca la página para intentarlo de nuevo.
            </p>
            <details className="text-left bg-gray-800 p-3 rounded-md text-sm text-gray-400">
              <summary className="cursor-pointer">Detalles del error (para depuración)</summary>
              <pre className="mt-2 whitespace-pre-wrap">
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;