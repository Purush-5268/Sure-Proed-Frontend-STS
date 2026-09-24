import React, { useEffect, useState, useMemo } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import CohortScreeningPanel from "../admin/CohortScreeningPanel";
import styles from "./CohortDetails.module.css";
import {
  FiUsers,
  FiBook,
  FiCalendar,
  FiArrowLeft,
  FiAlertCircle,
  FiUserCheck,
  FiVideo,
  FiSearch,
  FiExternalLink
} from "react-icons/fi";

function CohortDetails() {
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [searchParams] = useSearchParams();
  const id = paramId || searchParams.get("id");

  const [cohort, setCohort] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCohortDetails = async () => {
    if (!id) {
      setError("No cohort ID provided. Please return to My Cohorts.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch Cohort Details
      const cohortRes = await apiClient.get(API_ENDPOINTS.COHORTS.BY_ID(id));
      setCohort(cohortRes.data);

      // Fetch Enrolled Students for this cohort
      try {
        const studentsRes = await apiClient.get(API_ENDPOINTS.COHORTS.STUDENTS(id));
        const arr = Array.isArray(studentsRes.data?.results)
          ? studentsRes.data.results
          : Array.isArray(studentsRes.data)
          ? studentsRes.data
          : [];
        setStudents(arr);
      } catch (sErr) {
        console.warn("Failed to fetch students for cohort:", sErr);
        setStudents([]);
      }
    } catch (err) {
      console.error("Failed to fetch cohort details:", err);
      setError(
        err.response?.data?.detail ||
          "Failed to load cohort details. You may not have permission to view this cohort."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCohortDetails();
  }, [id]);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
        return <Badge variant="success">Active</Badge>;
      case "OPEN":
        return <Badge variant="primary">Open</Badge>;
      case "COMPLETED":
        return <Badge variant="default">Completed</Badge>;
      case "CANCELLED":
        return <Badge variant="error">Cancelled</Badge>;
      default:
        return <Badge variant="default">{status || "Draft"}</Badge>;
    }
  };

  // Compile full mentors list
  const mentorsList = useMemo(() => {
    if (!cohort) return [];
    if (Array.isArray(cohort.active_mentors) && cohort.active_mentors.length > 0) {
      return cohort.active_mentors;
    }
    if (Array.isArray(cohort.mentors) && cohort.mentors.length > 0) {
      return cohort.mentors.map((m) =>
        typeof m === "object"
          ? m
          : { id: m, name: cohort.mentor_name || "Assigned Mentor" }
      );
    }
    if (cohort.current_mentor_details) {
      return [cohort.current_mentor_details];
    }
    if (cohort.mentor_name) {
      return [{ id: "single", name: cohort.mentor_name }];
    }
    return [];
  }, [cohort]);

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter((s) => {
      const name = `${s.first_name || ""} ${s.last_name || ""}`.toLowerCase();
      const email = (s.email || s.user?.email || "").toLowerCase();
      const college = (s.college || "").toLowerCase();
      return name.includes(q) || email.includes(q) || college.includes(q);
    });
  }, [students, searchQuery]);

  if (loading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Cohort Details" description="Loading cohort information..." />
        <SkeletonLoader width="100%" height="320px" borderRadius="12px" />
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className={styles.container}>
        <PageHeader title="Cohort Details" />
        <EmptyState
          icon={<FiAlertCircle />}
          title="Cohort Not Found"
          description={
            error ||
            "The requested cohort does not exist or you do not have permission to view it."
          }
          action={
            <Link to="/mentor/cohorts" className="premium-btn">
              Return to My Cohorts
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/mentor/cohorts" className={styles.backLink}>
        <FiArrowLeft /> Back to My Cohorts
      </Link>

      {/* Cohort Overview Card */}
      <div className={styles.overviewCard}>
        <div className={styles.overviewHeader}>
          <div className={styles.titleArea}>
            <h1 className={styles.cohortTitle}>{cohort.name || "Cohort Details"}</h1>
            {cohort.code && <span className={styles.codeBadge}>{cohort.code}</span>}
          </div>
          <div className={styles.statusArea}>{getStatusBadge(cohort.status)}</div>
        </div>

        <div className={styles.infoGrid}>
          {/* Course */}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>
              <FiBook /> Course
            </span>
            <div className={styles.infoValue}>
              {cohort.course_name || cohort.course?.name || "General Course"}
            </div>
          </div>

          {/* Enrolled Students */}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>
              <FiUsers /> Total Enrolled
            </span>
            <div className={styles.infoValue}>
              {students.length} {cohort.max_students ? `/ ${cohort.max_students}` : ""} Students
            </div>
          </div>

          {/* Start Date */}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>
              <FiCalendar /> Start Date
            </span>
            <div className={styles.infoValue}>
              {cohort.start_date
                ? new Date(cohort.start_date).toLocaleDateString()
                : "Not Set"}
            </div>
          </div>

          {/* End Date */}
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>
              <FiCalendar /> End Date
            </span>
            <div className={styles.infoValue}>
              {cohort.end_date
                ? new Date(cohort.end_date).toLocaleDateString()
                : "Not Set"}
            </div>
          </div>

          {/* Assigned Mentors */}
          <div className={styles.infoItem} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.infoLabel}>
              <FiUserCheck /> Assigned Mentors
            </span>
            <div className={styles.infoValue}>
              {mentorsList.length > 0 ? (
                <div className={styles.mentorTags}>
                  {mentorsList.map((m, idx) => (
                    <span key={m.id || idx} className={styles.mentorBadge}>
                      <FiUserCheck size={13} />
                      {m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email}
                    </span>
                  ))}
                </div>
              ) : (
                <span className={styles.noMentorsText}>No mentors assigned</span>
              )}
            </div>
          </div>

          {/* Class Meeting Link (Regular cohort session) */}
          <div className={styles.infoItem} style={{ gridColumn: "1 / -1" }}>
            <span className={styles.infoLabel}>
              <FiVideo /> Regular Class Meeting Link
            </span>
            <div className={styles.infoValue}>
              {cohort.meeting_link ? (
                <a
                  href={cohort.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "var(--primary-color)",
                    fontWeight: "600",
                    textDecoration: "none",
                  }}
                >
                  Join Regular Class Meeting <FiExternalLink size={14} />
                </a>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>
                  No meeting link available
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Screening Panel for Mentor */}
      <div className={styles.screeningSection}>
        <CohortScreeningPanel
          cohortId={id}
          cohort={cohort}
          onSync={fetchCohortDetails}
        />
      </div>

      {/* Enrolled Students Section */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          Enrolled Students
          <span className={styles.countBadge}>{filteredStudents.length}</span>
        </h2>
        {students.length > 0 && (
          <input
            type="text"
            className={styles.searchBox}
            placeholder="Search students by name, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        )}
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={<FiUsers />}
          title="No Students Enrolled"
          description="There are currently no students assigned to this cohort."
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={<FiSearch />}
          title="No Matching Students"
          description={`No students matched "${searchQuery}".`}
        />
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.studentsTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>College</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  <td className={styles.studentName}>
                    {student.first_name} {student.last_name}
                  </td>
                  <td>{student.email || student.user?.email || "N/A"}</td>
                  <td>{student.college || "N/A"}</td>
                  <td>
                    {student.status === "ADMIN_APPROVED" ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="default">{student.status || "Enrolled"}</Badge>
                    )}
                  </td>
                  <td>
                    <Link
                      to={`/mentor/students/${student.id}`}
                      className={styles.viewProfileLink}
                    >
                      View Profile
                    </Link>
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

export default CohortDetails;