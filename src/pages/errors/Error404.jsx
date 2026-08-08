import { Link } from "react-router-dom";
import styles from "./ErrorPage.module.css";
import { FaExclamationCircle } from "react-icons/fa";

function Error404() {
  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.iconWrapper}>
          <FaExclamationCircle className={styles.icon} />
        </div>
        <h1>404 - Page Not Found</h1>
        <p>The page you are looking for doesn't exist or has been moved.</p>
        <Link to="/" className="premium-btn premium-btn-secondary">Return Home</Link>
      </div>
    </div>
  );
}

export default Error404;
