export function LoadingBar({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="loading-bar">
      <div className="loading-bar__inner" />
    </div>
  );
}
