import { Link } from "react-router-dom";
import styles from "./ExamDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function ExamDetails() {
  const exam = {
    title: "Java Screening Test",
    course: "Java Full Stack",
    duration: "60 Minutes",
    questions: 30,
    totalMarks: 30,
    passingMarks: 18,
    status: "Active",
    createdOn: "20 July 2026",
    description:
      "This screening exam evaluates Java, OOP, SQL and basic Aptitude knowledge.",
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <div className={styles.header}>
          <h1>Exam Details</h1>

          <Link to="/admin/exams">
            Back
          </Link>
        </div>

        <div className={styles.grid}>

          <div>
            <label>Exam Title</label>
            <p>{exam.title}</p>
          </div>

          <div>
            <label>Course</label>
            <p>{exam.course}</p>
          </div>

          <div>
            <label>Duration</label>
            <p>{exam.duration}</p>
          </div>

          <div>
            <label>Questions</label>
            <p>{exam.questions}</p>
          </div>

          <div>
            <label>Total Marks</label>
            <p>{exam.totalMarks}</p>
          </div>

          <div>
            <label>Passing Marks</label>
            <p>{exam.passingMarks}</p>
          </div>

          <div>
            <label>Status</label>
            <span className="premium-badge premium-badge-active">
              {exam.status}
            </span>
          </div>

          <div>
            <label>Created On</label>
            <p>{exam.createdOn}</p>
          </div>

        </div>

        <div className={styles.description}>
          <label>Description</label>
          <p>{exam.description}</p>
        </div>

        <div className={styles.buttons}>
          <Link to="/admin/edit-exam" className="premium-btn">
            Edit Exam
          </Link>
        </div>

      </div>
    </div>
  );
}

export default ExamDetails;