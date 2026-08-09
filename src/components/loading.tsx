// Universal loading indicators. LoadingScreen for page-level loads,
// Spinner for small in-place loads (tables, sections).

export function LoadingScreen({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={
        fullScreen
          ? { position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem" }
          : { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "3rem 1rem" }
      }
    >
      <span className="loadingBrand" style={{ fontSize: "2.5rem" }}>{"//"}</span>
      <p style={{ margin: 0, color: "var(--muted)" }}>Loading...</p>
    </div>
  );
}

export function Spinner({ size = 28 }: { size?: number }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
    />
  );
}
