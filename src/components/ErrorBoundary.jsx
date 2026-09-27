import { Component } from 'react';

// 1つの画面で失敗しても、切り替え・設定は使えるようにする（記録は消えない）
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="placeholder" role="alert">
        <p>
          <b>この画面を表示できませんでした</b>
        </p>
        <p className="note">記録は消えていません。読み込み直すか、ほかの画面に切り替えてください</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          読み込み直す
        </button>
      </div>
    );
  }
}
