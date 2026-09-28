"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f5f7fc" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ color: "#1B2A7B" }}>Business Hub Computers</h1>
          <p>We&apos;re having a temporary problem. Please try again in a moment.</p>
          <button onClick={reset} style={{ background: "#1B2A7B", color: "#fff", border: 0, borderRadius: 10, padding: "12px 20px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
