export function SureProEdLogo({
  size = 40,
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
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0, overflow: "visible" }}
      >
        <defs>
          {/* Diamond outer background gradient */}
          <linearGradient id="sureDiamondGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00b4d8" />
            <stop offset="30%" stopColor="#3a86ff" />
            <stop offset="70%" stopColor="#7209b7" />
            <stop offset="100%" stopColor="#f72585" />
          </linearGradient>

          {/* Purple Card Gradient */}
          <linearGradient id="sureCardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8318a0" />
            <stop offset="100%" stopColor="#681180" />
          </linearGradient>

          {/* Gold text gradient */}
          <linearGradient id="sureGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>

          {/* Green tree leaf gradient */}
          <linearGradient id="sureLeafGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#65a30d" />
          </linearGradient>

          {/* Tree Trunk gradient */}
          <linearGradient id="sureTrunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c2410c" />
            <stop offset="100%" stopColor="#9a3412" />
          </linearGradient>
        </defs>

        {/* 1. Outer Diamond / Rhombus */}
        <rect
          x="100"
          y="6"
          width="132"
          height="132"
          rx="12"
          transform="rotate(45 100 6)"
          fill="url(#sureDiamondGrad)"
        />

        {/* 2. Inner Purple Card */}
        <rect
          x="38"
          y="36"
          width="124"
          height="128"
          rx="20"
          fill="url(#sureCardGrad)"
          stroke="#a855f7"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />

        {/* 3. Tree Leaves (Green Circles Array) */}
        {/* Top apex */}
        <circle cx="100" cy="54" r="7" fill="url(#sureLeafGrad)" />

        {/* Row 2 */}
        <circle cx="94" cy="67" r="7.5" fill="url(#sureLeafGrad)" />
        <circle cx="106" cy="67" r="7.5" fill="url(#sureLeafGrad)" />

        {/* Row 3 */}
        <circle cx="87" cy="80" r="8" fill="url(#sureLeafGrad)" />
        <circle cx="100" cy="79" r="8.5" fill="url(#sureLeafGrad)" />
        <circle cx="113" cy="80" r="8" fill="url(#sureLeafGrad)" />

        {/* Row 4 - Outer Flanks */}
        <circle cx="79" cy="94" r="9" fill="url(#sureLeafGrad)" />
        <circle cx="91" cy="92" r="8" fill="url(#sureLeafGrad)" />
        <circle cx="109" cy="92" r="8" fill="url(#sureLeafGrad)" />
        <circle cx="121" cy="94" r="9" fill="url(#sureLeafGrad)" />

        {/* Row 5 - Bottom base canopy */}
        <circle cx="73" cy="110" r="10.5" fill="url(#sureLeafGrad)" />
        <circle cx="87" cy="108" r="8.5" fill="url(#sureLeafGrad)" />
        <circle cx="113" cy="108" r="8.5" fill="url(#sureLeafGrad)" />
        <circle cx="127" cy="110" r="10.5" fill="url(#sureLeafGrad)" />

        {/* 4. Tree Trunk (Central pointed cone / triangle) */}
        <path
          d="M100 86 L108 107 L114 135 L86 135 L92 107 Z"
          fill="url(#sureTrunkGrad)"
          stroke="#78350f"
          strokeWidth="0.5"
        />

        {/* 5. Brand Text inside card */}
        <text
          x="100"
          y="146"
          textAnchor="middle"
          fill="url(#sureGoldGrad)"
          fontFamily="'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
          fontWeight="800"
          fontSize="13.5"
          letterSpacing="0.5"
        >
          {brandTitle}
        </text>

        {/* 6. Caption inside card */}
        <text
          x="100"
          y="157"
          textAnchor="middle"
          fill="#fef08a"
          fontFamily="'Segoe UI', Roboto, Arial, sans-serif"
          fontWeight="600"
          fontSize="4.6"
          letterSpacing="0.4"
          opacity="0.9"
        >
          SKILL UPGRADATION FOR RURAL YOUTH EMPOWERMENT
        </text>
      </svg>

      {showText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 900,
              letterSpacing: "0.02em",
              color: "#0f172a",
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
              fontSize: "9.5px",
              fontWeight: 700,
              color: "#64748b",
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
