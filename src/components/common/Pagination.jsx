import React from 'react';

function Pagination({ page, setPage, hasNext, hasPrev, loading }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.5rem" }}>
      <button
        disabled={!hasPrev || loading}
        onClick={() => setPage(p => Math.max(1, p - 1))}
        className="premium-btn"
        style={{ 
          backgroundColor: hasPrev ? "var(--primary-color)" : "var(--bg-nested)", 
          color: hasPrev ? "#fff" : "var(--text-muted)" 
        }}
      >
        &larr; Previous Page
      </button>
      <span style={{ fontSize: "14px", fontWeight: "bold" }}>Page {page}</span>
      <button
        disabled={!hasNext || loading}
        onClick={() => setPage(p => p + 1)}
        className="premium-btn"
        style={{ 
          backgroundColor: hasNext ? "var(--primary-color)" : "var(--bg-nested)", 
          color: hasNext ? "#fff" : "var(--text-muted)" 
        }}
      >
        Next Page &rarr;
      </button>
    </div>
  );
}

export default Pagination;
