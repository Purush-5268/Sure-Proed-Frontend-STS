import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Exam.module.css";

function Exam() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadQuestions = async () => {
      try {
        const response = await apiClient.get(API_ENDPOINTS.QUESTIONS.BASE);
        if (isMounted) setQuestions(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error("Failed to load exam questions:", err);
        if (isMounted) setQuestions([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadQuestions();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOptionSelect = (option) => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion]: option,
    }));
  };

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  const previousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  const submitExam = () => {
    navigate("/student/exam-result", { state: { answers, questions } });
  };

  if (loading) {
    return <div className={styles.examPage}><div className={styles.examCard}><SkeletonLoader variant="form" rows={4} /></div></div>;
  }

  if (questions.length === 0) {
    return <div className={styles.examPage}><div className={styles.examCard}><p>No exam questions are available yet.</p></div></div>;
  }

  const activeQuestion = questions[currentQuestion];

  return (
    <div className={styles.examPage}>
      <div className={styles.examCard}>
        <div className={styles.topBar}>
          <h2>Question {currentQuestion + 1} of {questions.length}</h2>
          <div className={styles.timer}>30:00</div>
        </div>

        <div className={styles.questionSection}>
          <h3>{activeQuestion.question}</h3>

          <div className={styles.options}>
            {(activeQuestion.options || []).map((option) => (
              <label key={option} className={styles.option}>
                <input
                  type="radio"
                  name={`question-${currentQuestion}`}
                  value={option}
                  checked={answers[currentQuestion] === option}
                  onChange={() => handleOptionSelect(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.buttons}>
          <button type="button" onClick={previousQuestion} disabled={currentQuestion === 0}>
            Previous
          </button>

          {currentQuestion === questions.length - 1 ? (
            <button type="button" onClick={submitExam}>Submit Exam</button>
          ) : (
            <button type="button" onClick={nextQuestion}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Exam;