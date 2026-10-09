"use client";

/**
 * Last-resort error page, used only when the root layout itself fails. It
 * replaces the whole document, so it carries its own minimal styles.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f3eee3",
          color: "#1e1a15",
          fontFamily: "Georgia, 'Times New Roman', serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "36rem" }}>
          <p style={{ letterSpacing: "0.12em", fontSize: "0.8rem", textTransform: "uppercase" }}>
            Campaign Text Lab
          </p>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 500, margin: "0.5rem 0 1rem" }}>
            The reading room is closed for a moment.
          </h1>
          <p style={{ lineHeight: 1.6 }}>
            Something went wrong before the page could load. Please try again.
          </p>
          <p style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                font: "inherit",
                padding: "0.55rem 1rem",
                borderRadius: "6px",
                border: "none",
                background: "#24395a",
                color: "#f3eee3",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A plain anchor: the app router is unavailable here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#24395a", alignSelf: "center" }}>
              Go to the home page
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
