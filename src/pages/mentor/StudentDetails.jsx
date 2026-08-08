import { Link } from "react-router-dom";
import styles from "./StudentDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function StudentDetails() {

  const student = {
    name: "Rahul Kumar",
    email: "rahul@gmail.com",
    phone: "+91 9876543210",
    course: "Java Full Stack",
    cohort: "Batch A",
    attendance: "96%",
    assignments: "17 / 18 Submitted",
    exams: "88%",
    status: "Active",
  };

  return (
    <div className={styles.container}>

      <div className="premium-card">

        <div className={styles.header}>
          <h1>Student Details</h1>

          <Link to="/mentor/students">
            Back
          </Link>
        </div>

        <div className={styles.grid}>

          <div>
            <label>Name</label>
            <p>{student.name}</p>
          </div>

          <div>
            <label>Email</label>
            <p>{student.email}</p>
          </div>

          <div>
            <label>Phone</label>
            <p>{student.phone}</p>
          </div>

          <div>
            <label>Course</label>
            <p>{student.course}</p>
          </div>

          <div>
            <label>Cohort</label>
            <p>{student.cohort}</p>
          </div>

          <div>
            <label>Attendance</label>
            <p>{student.attendance}</p>
          </div>

          <div>
            <label>Assignments</label>
            <p>{student.assignments}</p>
          </div>

          <div>
            <label>Exam Performance</label>
            <p>{student.exams}</p>
          </div>

          <div>
            <label>Status</label>
            <span className="premium-badge premium-badge-active">
              {student.status}
            </span>
          </div>

        </div>

      </div>

    </div>
  );
}

export default StudentDetails;