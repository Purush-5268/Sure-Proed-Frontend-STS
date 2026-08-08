import { Link } from "react-router-dom";
import styles from "./ErrorPage.module.css";
import { FaBan } from "react-icons/fa";

function Error403() {
  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.iconWrapper}>
          <FaBan className={styles.icon} />
        </div>
        <h1>403 - Forbidden</h1>
        <p>You don't have permission to access this page. If you believe this is a mistake, contact your administrator.</p>
        <Link to="/" className="premium-btn premium-btn-secondary">Return Home</Link>
      </div>
    </div>
  );
}

export default Error403;
