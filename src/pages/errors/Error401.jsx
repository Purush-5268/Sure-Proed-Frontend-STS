import { Link } from "react-router-dom";
import styles from "./ErrorPage.module.css";
import { FaLock } from "react-icons/fa";

function Error401() {
  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.iconWrapper}>
          <FaLock className={styles.icon} />
        </div>
        <h1>401 - Unauthorized</h1>
        <p>You need to be logged in to access this page.</p>
        <Link to="/login" className="premium-btn premium-btn-secondary">Sign In</Link>
      </div>
    </div>
  );
}

export default Error401;
