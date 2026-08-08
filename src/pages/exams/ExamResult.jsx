import { useLocation, useNavigate } from "react-router-dom";
import styles from "./ExamResult.module.css";

function ExamResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const { answers = {}, questions = [] } = location.state || {};

  const correctAnswers = questions.reduce((acc, question, index) => {
    acc[index] = question.correct_answer;
    return acc;
  }, {});

  const score = questions.reduce((total, question, index) => {
    const studentAnswer = answers[index];
    const correctAnswer = question.correct_answer;
    return total + (studentAnswer && studentAnswer === correctAnswer ? 1 : 0);
  }, 0);

  const total = questions.length || 0;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const qualified = percentage >= 60;

  return (
    <div className={styles.page}>
      <div className="premium-card">
        <h1>Screening Exam Result</h1>

        <div className={styles.resultBox}>
          <h2>{qualified ? "🎉 Congratulations!" : "Exam Completed"}</h2>
          <p>Your Score</p>
          <div className={styles.score}>{score} / {total}</div>
          <div className={styles.percentage}>{percentage}%</div>
          <div className={qualified ? styles.qualified : styles.notQualified}>
            {qualified ? "QUALIFIED" : "NOT QUALIFIED"}
          </div>
        </div>

        <div className={styles.note}>
          {qualified ? (
            <p>Congratulations! You have successfully qualified for the internship. You can now access your assigned cohort.</p>
          ) : (
            <p>Unfortunately, you did not reach the qualifying score. You may apply again when the next screening exam opens.</p>
          )}
        </div>

        {qualified ? (
          <button className={styles.button} onClick={() => navigate("/student/cohort")}>Go to My Cohort</button>
        ) : (
          <button className={styles.button} onClick={() => navigate("/student/applications")}>Back to My Applications</button>
        )}
      </div>
    </div>
  );
}

export default ExamResult;