export function SureProEdLogo({
  size = 48,
  showText = true,
  brandTitle = "SURE TRUST",
  subtitle = "SKILL UPGRADATION FOR RURAL YOUTH EMPOWERMENT",
  className = "",
}) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
        userSelect: "none",
      }}
    >
      <img
        src="/sure-logo.jpg"
        alt="SURE TRUST Logo"
        width={size}
        height={size}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          objectFit: "contain",
          borderRadius: "8px",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
        }}
      />

      {showText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, textAlign: "left" }}>
          <div
            style={{
              fontSize: size >= 50 ? "18px" : "15px",
              fontWeight: 800,
              letterSpacing: "0.03em",
              color: "var(--text-primary, #0f172a)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span style={{ color: "#1e3a8a" }}>SURE</span>
            <span style={{ color: "#2563eb" }}>TRUST</span>
          </div>
          <span
            style={{
              fontSize: size >= 50 ? "10px" : "9px",
              fontWeight: 700,
              color: "var(--text-secondary, #64748b)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {subtitle}
          </span>
        </div>
      )}
    </div>
  );
}

export default SureProEdLogo;
