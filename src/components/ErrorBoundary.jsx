import React from 'react'

export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      console.error('ErrorBoundary caught:', this.state.error)
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '50vh', padding: '40px'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ marginBottom: '8px' }}>页面出现错误</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
            {this.state.error.message}
          </p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); window.location.reload() }}>
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
