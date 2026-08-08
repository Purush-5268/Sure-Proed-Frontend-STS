import { Link } from "react-router-dom";
import styles from "./NotFound.module.css";

function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.errorCode}>404</h1>
        <h2 className={styles.title}>Page Not Found</h2>
        <p className={styles.description}>
          Sorry, the page you are looking for does not exist or has been moved.
        </p>
        <div className="actions" style={{display: "flex", gap: "8px"}}>
          <Link to="/" className={styles.homeBtn}>
            Go to Home
          </Link>
          <Link to="/login" className={styles.secondaryBtn}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
