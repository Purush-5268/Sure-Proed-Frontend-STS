import { Link } from "react-router-dom";
import styles from "./CertificateAdminDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CertificateAdminDetails() {
  const certificate = {
    student: "Rahul Sharma",
    course: "Java Full Stack",
    certificateId: "CERT-2026-001",
    issueDate: "25 July 2026",
    status: "Issued",
    grade: "A",
    description:
      "Certificate issued after successful completion of the Java Full Stack Training Program.",
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Certificate Details</h1>

          <Link to="/admin/certificates">
            Back
          </Link>
        </div>

        <div className={styles.grid}>

          <div>
            <label>Student</label>
            <p>{certificate.student}</p>
          </div>

          <div>
            <label>Course</label>
            <p>{certificate.course}</p>
          </div>

          <div>
            <label>Certificate ID</label>
            <p>{certificate.certificateId}</p>
          </div>

          <div>
            <label>Issue Date</label>
            <p>{certificate.issueDate}</p>
          </div>

          <div>
            <label>Grade</label>
            <p>{certificate.grade}</p>
          </div>

          <div>
            <label>Status</label>
            <span className={styles.issued}>
              {certificate.status}
            </span>
          </div>

        </div>

        <div className={styles.description}>
          <label>Description</label>
          <p>{certificate.description}</p>
        </div>

        <div className={styles.buttons}>
          <Link to="/admin/edit-certificate">
            Edit Certificate
          </Link>
        </div>

      </div>
    </div>
  );
}

export default CertificateAdminDetails;