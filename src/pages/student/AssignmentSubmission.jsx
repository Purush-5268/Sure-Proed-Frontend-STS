import { useNavigate } from "react-router-dom";
import styles from "./AssignmentSubmission.module.css";

function AssignmentSubmission() {
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    alert("Assignment Submitted Successfully ✅");

    navigate("/student/assignment-feedback");
  };

  return (
    <div className={styles.page}>
      <div className="premium-card">

        <h1>Assignment Submission</h1>

        <p className={styles.subtitle}>
          Upload your completed assignment before the deadline.
        </p>

        <form
          className={styles.form}
          onSubmit={handleSubmit}
        >

          <div className={styles.group}>
            <label htmlFor="assignment-file">Assignment File</label>

            <input
              id="assignment-file"
              type="file"
              required
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="repo-url">GitHub Repository Link</label>

            <input
              id="repo-url"
              type="url"
              placeholder="https://github.com/username/project"
              required
            />
          </div>

          <div className={styles.group}>
            <label htmlFor="submission-comments">Comments (Optional)</label>

            <textarea
              id="submission-comments"
              rows="5"
              placeholder="Write any notes for your mentor..."
            ></textarea>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
          >
            Submit Assignment
          </button>

        </form>

      </div>
    </div>
  );
}

export default AssignmentSubmission;