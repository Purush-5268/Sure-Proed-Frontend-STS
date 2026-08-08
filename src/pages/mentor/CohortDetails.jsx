import { Link } from "react-router-dom";
import styles from "./CohortDetails.module.css";
import SkeletonLoader from "../../components/common/SkeletonLoader";

function CohortDetails() {

  const cohort = {
    name: "Java Full Stack - Batch A",
    course: "Java Full Stack",
    mentor: "Mr. Rahul Kumar",
    students: 42,
    duration: "6 Months",
    schedule: "Mon - Fri | 10:00 AM - 12:00 PM",
    startDate: "01 Aug 2026",
    endDate: "31 Jan 2027",
    status: "Ongoing",
  };

  return (
    <div className={styles.container}>

      <div className="premium-card">

        <div className={styles.header}>
          <h1>Cohort Details</h1>

          <Link to="/mentor/cohorts">
            Back
          </Link>
        </div>

        <div className={styles.grid}>

          <div>
            <label>Cohort Name</label>
            <p>{cohort.name}</p>
          </div>

          <div>
            <label>Course</label>
            <p>{cohort.course}</p>
          </div>

          <div>
            <label>Mentor</label>
            <p>{cohort.mentor}</p>
          </div>

          <div>
            <label>Total Students</label>
            <p>{cohort.students}</p>
          </div>

          <div>
            <label>Duration</label>
            <p>{cohort.duration}</p>
          </div>

          <div>
            <label>Schedule</label>
            <p>{cohort.schedule}</p>
          </div>

          <div>
            <label>Start Date</label>
            <p>{cohort.startDate}</p>
          </div>

          <div>
            <label>End Date</label>
            <p>{cohort.endDate}</p>
          </div>

          <div>
            <label>Status</label>
            <span className="premium-badge premium-badge-active">
              {cohort.status}
            </span>
          </div>

        </div>

      </div>

    </div>
  );
}

export default CohortDetails;