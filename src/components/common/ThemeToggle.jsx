import { useTheme } from "../../context/ThemeContext";
import styles from "./ThemeToggle.module.css";
import { FaSun, FaMoon, FaDesktop } from "react-icons/fa";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={styles.container}>
      <label className={styles.label}>Appearance Mode</label>
      <div className={styles.toggleGroup}>
        <button
          className={`${styles.toggleBtn} ${theme === 'light' ? styles.active : ''}`}
          onClick={() => setTheme('light')}
          aria-label="Light Theme"
        >
          <FaSun /> Light
        </button>
        <button
          className={`${styles.toggleBtn} ${theme === 'dark' ? styles.active : ''}`}
          onClick={() => setTheme('dark')}
          aria-label="Dark Theme"
        >
          <FaMoon /> Dark
        </button>
        <button
          className={`${styles.toggleBtn} ${theme === 'system' ? styles.active : ''}`}
          onClick={() => setTheme('system')}
          aria-label="System Theme"
        >
          <FaDesktop /> System
        </button>
      </div>
    </div>
  );
}

export default ThemeToggle;
