import { Link } from "react-router-dom";
import styles from "./ErrorPage.module.css";
import { FaServer } from "react-icons/fa";

function Error500() {
  return (
    <div className={styles.container}>
      <div className="premium-card">
        <div className={styles.iconWrapper}>
          <FaServer className={styles.icon} />
        </div>
        <h1>500 - Server Error</h1>
        <p>Oops, something went wrong on our end. Please try again later.</p>
        <Link to="/" className="premium-btn premium-btn-secondary">Return Home</Link>
      </div>
    </div>
  );
}

export default Error500;
