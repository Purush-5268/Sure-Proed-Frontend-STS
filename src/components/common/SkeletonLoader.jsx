import styles from "./SkeletonLoader.module.css";

/**
 * Premium animated skeleton loader.
 * 
 * Props:
 *   type: "rect" | "circle" | "text" (shape)
 *   variant: "page" | "table" | "detail" | "form" | "card" | "inline" (layout)
 *   rows: number of skeleton rows (for table/form)
 *   width/height: custom dimensions
 */
function SkeletonLoader({ type = "rect", variant, width, height, className = "", rows = 5 }) {
  // If no variant, render a single skeleton shape (backwards compatible)
  if (!variant) {
    const style = {};
    if (width) style.width = width;
    if (height) style.height = height;
    return (
      <div className={`${styles.skeleton} ${styles[type]} ${className}`} style={style} />
    );
  }

  // Table variant: header + rows
  if (variant === "table") {
    return (
      <div className={styles.skeletonContainer}>
        <div className={styles.skeletonRow}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${styles.skeleton} ${styles.headerCell}`} />
          ))}
        </div>
        {[...Array(rows)].map((_, i) => (
          <div key={i} className={styles.skeletonRow} style={{ animationDelay: `${i * 80}ms` }}>
            {[...Array(4)].map((_, j) => (
              <div key={j} className={`${styles.skeleton} ${styles.cell}`} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Detail variant: title + subtitle + grid of label/value pairs
  if (variant === "detail") {
    return (
      <div className={styles.skeletonContainer}>
        <div className={`${styles.skeleton} ${styles.titleBar}`} />
        <div className={`${styles.skeleton} ${styles.subtitleBar}`} />
        <div className={styles.detailGrid}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className={styles.detailItem} style={{ animationDelay: `${i * 60}ms` }}>
              <div className={`${styles.skeleton} ${styles.detailLabel}`} />
              <div className={`${styles.skeleton} ${styles.detailValue}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Form variant: title + label/input pairs + button
  if (variant === "form") {
    return (
      <div className={styles.skeletonContainer}>
        <div className={`${styles.skeleton} ${styles.titleBar}`} />
        {[...Array(rows)].map((_, i) => (
          <div key={i} className={styles.formGroup} style={{ animationDelay: `${i * 70}ms` }}>
            <div className={`${styles.skeleton} ${styles.formLabel}`} />
            <div className={`${styles.skeleton} ${styles.formInput}`} />
          </div>
        ))}
        <div className={`${styles.skeleton} ${styles.formButton}`} />
      </div>
    );
  }

  // Card variant: grid of card placeholders
  if (variant === "card") {
    return (
      <div className={styles.skeletonContainer}>
        <div className={styles.cardGrid}>
          {[...Array(rows)].map((_, i) => (
            <div key={i} className={`${styles.skeleton} ${styles.cardSkeleton}`} style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Page variant (default): header + cards + table block
  return (
    <div className={styles.skeletonContainer}>
      <div className={styles.pageHeader}>
        <div className={`${styles.skeleton} ${styles.titleBar}`} />
        <div className={`${styles.skeleton} ${styles.subtitleBar}`} />
      </div>
      <div className={styles.cardGrid}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`${styles.skeleton} ${styles.cardSkeleton}`} style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
      <div className={`${styles.skeleton} ${styles.tableSkeleton}`} />
    </div>
  );
}

export default SkeletonLoader;
