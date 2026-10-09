import { ImageResponse } from "next/og";

export const alt = "Campaign Text Lab: US campaign documents and debates, read closely";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f3eee3",
        color: "#1e1a15",
        padding: "64px 72px",
        fontFamily: "serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#5b5346" }}>
        CAMPAIGN TEXT LAB · 2016–2024 DOCUMENTS · 1960–2024 DEBATES
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 76, lineHeight: 1.05, maxWidth: 980 }}>
          What US campaigns put on the record, read closely.
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 28, color: "#24395a" }}>
          7,556 campaign documents · 179 debate transcripts · 43,662 speaking turns
        </div>
      </div>
      <div
        style={{
          display: "flex",
          borderTop: "2px solid #1e1a15",
          paddingTop: 18,
          fontSize: 20,
          color: "#5b5346",
        }}
      >
        Derived statistics from The American Presidency Project, UC Santa Barbara
      </div>
    </div>,
    size,
  );
}
