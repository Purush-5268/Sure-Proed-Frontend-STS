import { useNavigate } from "react-router-dom";
import styles from "./ExamInstructions.module.css";

function ExamInstructions() {
  const navigate = useNavigate();

  const handleStartExam = () => {
    navigate("/student/exam");
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">

        <h1>Screening Examination</h1>

        <p className={styles.subtitle}>
          Please read all instructions carefully before starting the examination.
        </p>

        <div className={styles.section}>
          <h2>Exam Details</h2>

          <ul>
            <li>
              Total Questions : <strong>30</strong>
            </li>

            <li>
              Duration : <strong>30 Minutes</strong>
            </li>

            <li>
              Question Type : <strong>Multiple Choice Questions</strong>
            </li>

            <li>
              Passing Score : <strong>60%</strong>
            </li>
          </ul>
        </div>

        <div className={styles.section}>
          <h2>Instructions</h2>

          <ul>
            <li>Read every question carefully.</li>
            <li>Each question has only one correct answer.</li>
            <li>Do not refresh the browser during the exam.</li>
            <li>The timer will automatically submit the exam.</li>
            <li>Ensure stable internet connectivity.</li>
            <li>Do not close the browser window during the examination.</li>
          </ul>
        </div>

        <button
          type="button"
          className={styles.startButton}
          onClick={handleStartExam}
        >
          Start Examination
        </button>

      </div>
    </div>
  );
}

export default ExamInstructions;