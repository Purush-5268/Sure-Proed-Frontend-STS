import styles from "./GlobalLoader.module.css";

function GlobalLoader({ message = "Loading..." }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <div className={styles.pulseLogo}></div>
        <div className={styles.loadingBarWrapper}>
          <div className={styles.loadingBar}></div>
        </div>
        <p className={styles.message}>{message}</p>
      </div>
    </div>
  );
}

export default GlobalLoader;
