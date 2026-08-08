import { Link } from "react-router-dom";
import styles from "./AssignmentAdminDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function AssignmentAdminDetails() {
  const assignment = {
    title: "React Mini Project",
    course: "MERN Stack",
    dueDate: "30 July 2026",
    totalMarks: 100,
    submissions: 42,
    status: "Active",
    createdOn: "20 July 2026",
    description:
      "Students must build a responsive React application using reusable components, React Router, and API integration.",
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Assignment Details</h1>

          <Link to="/admin/assignments">
            Back
          </Link>
        </div>

        <div className={styles.grid}>

          <div>
            <label>Assignment Title</label>
            <p>{assignment.title}</p>
          </div>

          <div>
            <label>Course</label>
            <p>{assignment.course}</p>
          </div>

          <div>
            <label>Due Date</label>
            <p>{assignment.dueDate}</p>
          </div>

          <div>
            <label>Total Marks</label>
            <p>{assignment.totalMarks}</p>
          </div>

          <div>
            <label>Submissions</label>
            <p>{assignment.submissions}</p>
          </div>

          <div>
            <label>Created On</label>
            <p>{assignment.createdOn}</p>
          </div>

          <div>
            <label>Status</label>

            <span className="premium-badge premium-badge-active">
              {assignment.status}
            </span>
          </div>

        </div>

        <div className={styles.description}>
          <label>Description</label>
          <p>{assignment.description}</p>
        </div>

        <div className={styles.buttons}>
          <Link to="/admin/edit-assignment">
            Edit Assignment
          </Link>
        </div>

      </div>
    </div>
  );
}

export default AssignmentAdminDetails;