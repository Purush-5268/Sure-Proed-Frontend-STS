import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import styles from "./Exams.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function Exams() {
  const [exams, setExams] = useState([]);
  const [applications, setApplications] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [examsResponse, applicationsResponse, coursesResponse] = await Promise.all([
          apiClient.get(API_ENDPOINTS.EXAMS.BASE),
          apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE),
          apiClient.get(API_ENDPOINTS.COURSES.BASE),
        ]);

        if (isMounted) {
          setExams(Array.isArray(examsResponse.data) ? examsResponse.data : []);
          setApplications(Array.isArray(applicationsResponse.data) ? applicationsResponse.data : []);
          setCourses(Array.isArray(coursesResponse.data) ? coursesResponse.data : []);
        }
      } catch (err) {
        console.error("Failed to load exams:", err);
        if (isMounted) {
          setExams([]);
          setApplications([]);
          setCourses([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const getCourseName = (applicationId) => {
    const application = applications.find((item) => item.id === applicationId);
    const courseId = application?.course;
    const course = courses.find((item) => item.id === courseId);
    return course?.name || application?.course?.name || "N/A";
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Exam Management</h1>
          <p>Manage all screening exams</p>
        </div>

        <Link to="/admin/add-exam" className={styles.addBtn}>
          + Add Exam
        </Link>
      </div>

      {loading ? (
        <SkeletonLoader variant="table" rows={5} />
      ) : exams.length === 0 ? (
        <p>No exams have been created yet.</p>
      ) : (
        <div className="premium-table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Course</th>
                <th>Duration</th>
                <th>Questions</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td>{exam.level || "Exam"}</td>
                  <td>{getCourseName(exam.application)}</td>
                  <td>{exam.duration_minutes ? `${exam.duration_minutes} mins` : "N/A"}</td>
                  <td>{Array.isArray(exam.questions) ? exam.questions.length : 0}</td>

                  <td className={exam.status === "PENDING" ? styles.upcoming : exam.status === "SUBMITTED" ? styles.completed : styles.active}>
                    {exam.status || "PENDING"}
                  </td>

                  <td className="actions" style={{ display: "flex", gap: "8px" }}>
                    <Link to="/admin/exam-details">View</Link>
                    <Link to="/admin/edit-exam">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Exams;