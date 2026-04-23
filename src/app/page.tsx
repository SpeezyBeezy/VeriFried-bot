// src/app/page.tsx
// The root page has no purpose in this app.
// Redirect or show a minimal placeholder.

export default function RootPage() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0d0d0f",
      color: "#b5bac1",
      fontFamily: "sans-serif",
      fontSize: "0.9rem",
    }}>
      <p>Nothing to see here.</p>
    </main>
  );
}
