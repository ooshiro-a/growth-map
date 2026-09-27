// まだ作っていない画面
export function Placeholder({ name, phase }) {
  return (
    <div className="placeholder">
      <p>
        <b>{name}</b>
      </p>
      <p className="note">フェーズ{phase}で作ります</p>
    </div>
  );
}
