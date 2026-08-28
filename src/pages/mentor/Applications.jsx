import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import Pagination from "../../components/common/Pagination";
import styles from "./Applications.module.css";
import { FiFileText, FiClock, FiCheckCircle, FiXCircle, FiInfo } from "react-icons/fi";

function MentorApplications() {
  const { globalCohort } = useOutletContext() || {};
  const [applications, setApplications] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadApplications = async () => {
      try {
        setLoading(true);
        const params = { page };
        if (globalCohort) params.cohort = globalCohort;
        
        // Fetch applications, courses, and cohorts concurrently
        const [appRes, coursesData, cohortsData] = await Promise.allSettled([
          apiClient.get(API_ENDPOINTS.APPLICATIONS.BASE, { params }),
          fetchAllPages(API_ENDPOINTS.COURSES.BASE),
          fetchAllPages(API_ENDPOINTS.COHORTS.MY_COHORTS)
        ]);
        
        if (isMounted) {
          if (appRes.status === "fulfilled") {
            const data = appRes.value.data;
            setApplications(Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []));
            setHasNext(!!data.next);
            setHasPrev(!!data.previous);
            setTotalCount(data.count || 0);
          }
          
          if (coursesData.status === "fulfilled") {
            setCourses(coursesData.value);
          }
          
          if (cohortsData.status === "fulfilled") {
            setCohorts(cohortsData.value);
          }
        }
      } catch (err) {
        console.error("Failed to load applications:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadApplications();
    return () => { isMounted = false; };
  }, [globalCohort, page]);

  useEffect(() => {
    setPage(1);
  }, [globalCohort]);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'ADMIN_APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="error">Rejected</Badge>;
      case 'APPLIED':
        return <Badge variant="warning">Pending</Badge>;
      default:
        return <Badge variant="default">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Cohort Applications" 
        description="View incoming applications and screening status for your assigned cohorts."
      />

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
        </div>
      ) : applications.length === 0 ? (
        <EmptyState 
          icon={<FiFileText />}
          title="No Applications Found"
          description="There are currently no applications for your assigned cohorts."
        />
      ) : (
        <Card>
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Application Number</th>
                  <th>Student Name</th>
                  <th>Course</th>
                  <th>Cohort</th>
                  <th>Status</th>
                  <th>Applied On</th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => {
                  const courseId = typeof app.course === 'object' ? app.course?.id : app.course;
                  const courseName = typeof app.course === 'object' 
                    ? (app.course?.name || app.course?.code) 
                    : (courses.find(c => String(c.id) === String(courseId))?.name || "Unknown Course");

                  const cohortId = typeof app.assigned_cohort === 'object' ? app.assigned_cohort?.id : app.assigned_cohort;
                  const matchedCohort = cohorts.find(c => String(c.id) === String(cohortId));
                  const cohortCode = typeof app.assigned_cohort === 'object'
                    ? (app.assigned_cohort?.code || app.assigned_cohort?.name || "Unassigned")
                    : (matchedCohort?.code || matchedCohort?.name || "Unassigned");
                    
                  const studentName = app.student_details?.name || "Student";
                  
                  return (
                    <tr key={app.id}>
                      <td>
                        <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
                          {app.application_number}
                        </span>
                      </td>
                      <td style={{ fontWeight: "500" }}>
                        {studentName}
                      </td>
                      <td>{courseName}</td>
                      <td>{cohortCode}</td>
                      <td>{getStatusBadge(app.status)}</td>
                      <td>{new Date(app.applied_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {!loading && applications.length > 0 && (
            <Pagination 
              page={page} 
              setPage={setPage} 
              hasNext={hasNext} 
              hasPrev={hasPrev} 
              loading={loading} 
            />
          )}
        </Card>
      )}
    </div>
  );
}

export default MentorApplications;
