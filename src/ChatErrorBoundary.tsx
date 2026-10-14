import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; onClose: () => void }
type State = { failed: boolean }

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GentrY conversation display error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="modal-backdrop"><section className="modal" role="alert" aria-live="assertive">
      <span className="modal-kicker">CONVERSATION</span>
      <h2>This reply could not be displayed.</h2>
      <p>If you approved a payment, check your wallet before sending the request again.</p>
      <button className="primary-button wide" onClick={this.props.onClose}>Back to agents</button>
    </section></div>
  }
}
