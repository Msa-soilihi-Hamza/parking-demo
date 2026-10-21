/** The app icon (an "E" on the theme's red), drawn with next/og for PNG icons. */
export function EscaleMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#b4231b",
        color: "white",
        fontSize: size * 0.55,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      E
    </div>
  );
}
