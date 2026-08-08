import { Link } from "react-router-dom";
import styles from "./MentorDetails.module.css";

function MentorDetails() {
  return (
    <div className={styles.page}>
      <div className="premium-card">

        <div className={styles.profile}>

          <img
            src="https://ui-avatars.com/api/?name=Rajesh+Kumar&background=2563eb&color=fff&size=180"
            alt="Mentor"
          />

          <h1>Rajesh Kumar</h1>

          <p>Senior Full Stack Developer & Internship Mentor</p>

        </div>

        <div className={styles.infoGrid}>

          <div className={styles.infoBox}>
            <h3>Email</h3>
            <p>rajesh@example.com</p>
          </div>

          <div className={styles.infoBox}>
            <h3>Phone</h3>
            <p>+91 9876543210</p>
          </div>

          <div className={styles.infoBox}>
            <h3>Experience</h3>
            <p>8+ Years</p>
          </div>

          <div className={styles.infoBox}>
            <h3>Specialization</h3>
            <p>Java, Spring Boot, React</p>
          </div>

          <div className={styles.infoBox}>
            <h3>Office Hours</h3>
            <p>Mon - Fri (5 PM - 6 PM)</p>
          </div>

          <div className={styles.infoBox}>
            <h3>LinkedIn</h3>

            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noreferrer"
            >
              View Profile
            </a>

          </div>

        </div>

        <div className={styles.buttons}>
          <Link
            to="/student/attendance"
            className={styles.button}
          >
            View Attendance
          </Link>
        </div>

      </div>
    </div>
  );
}

export default MentorDetails;