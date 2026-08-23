import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./EditExam.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function EditExam() {
  const navigate = useNavigate();

  const [exam, setExam] = useState({
    title: "Java Screening Test",
    course: "Java Full Stack",
    duration: "60",
    questions: "30",
    totalMarks: "30",
    passingMarks: "18",
    status: "Active",
    description:
      "This screening exam evaluates Java, OOP, SQL and Aptitude skills.",
  });

  const handleChange = (e) => {
    setExam({
      ...exam,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    alert("Exam Updated Successfully!");

    navigate("/admin/exams");
  };

  return (
    <div className={styles.container}>
      <div className="premium-card">

        <h1>Edit Exam</h1>

        <form onSubmit={handleSubmit}>

          <div className={styles.grid}>

            <div>
              <label>Exam Title</label>
              <input
                type="text"
                name="title"
                value={exam.title}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>Course</label>
              <input
                type="text"
                name="course"
                value={exam.course}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>Duration (Minutes)</label>
              <input
                type="number"
                name="duration"
                value={exam.duration}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>No. of Questions</label>
              <input
                type="number"
                name="questions"
                value={exam.questions}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>Total Marks</label>
              <input
                type="number"
                name="totalMarks"
                value={exam.totalMarks}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>Passing Marks</label>
              <input
                type="number"
                name="passingMarks"
                value={exam.passingMarks}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>Status</label>

              <select
                name="status"
                value={exam.status}
                onChange={handleChange}
              >
                <option>Active</option>
                <option>Upcoming</option>
                <option>Completed</option>
              </select>
            </div>

          </div>

          <label>Description</label>

          <textarea
            rows="5"
            name="description"
            value={exam.description}
            onChange={handleChange}
          />

          <div className={styles.buttons}>
            <button type="submit" className="premium-btn">
              Update Exam
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

export default EditExam;