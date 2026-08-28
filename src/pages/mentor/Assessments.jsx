import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import Pagination from "../../components/common/Pagination";
import styles from "./Assessments.module.css";
import { FiCheckSquare, FiFileText } from "react-icons/fi";

function MentorAssessments() {
  const { globalCohort } = useOutletContext() || {};
  const [activeTab, setActiveTab] = useState("EXAMS");
  const [dataList, setDataList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Reset page when tab or cohort changes
  useEffect(() => {
    setPage(1);
  }, [activeTab, globalCohort]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setLoading(true);
        const params = { page };
        if (globalCohort) params.cohort = globalCohort;

        const endpoint = activeTab === "EXAMS" 
          ? API_ENDPOINTS.EXAMS.BASE 
          : API_ENDPOINTS.MODULE_TESTS.SUBMISSIONS;

        const res = await apiClient.get(endpoint, { params });
        const resData = res.data;

        if (isMounted) {
          const results = Array.isArray(resData.results) ? resData.results : (Array.isArray(resData) ? resData : []);
          setDataList(results);
          setHasNext(!!resData.next);
          setHasPrev(!!resData.previous);
          setTotalCount(resData.count || 0);
        }
      } catch (err) {
        console.error(`Failed to load ${activeTab.toLowerCase()}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [activeTab, globalCohort, page]);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'PASSED':
      case 'QUALIFIED':
        return <Badge variant="success">Passed</Badge>;
      case 'FAILED':
      case 'DISQUALIFIED':
        return <Badge variant="error">Failed</Badge>;
      case 'SUBMITTED':
      case 'COMPLETED':
        return <Badge variant="primary">Completed</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">In Progress</Badge>;
      default:
        return <Badge variant="default">{status || 'Scheduled'}</Badge>;
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Exams & Module Tests" 
        description="Review exam and module test performance for your assigned cohorts."
      />

      <div className={styles.tabContainer}>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'EXAMS' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('EXAMS')}
        >
          Exams
        </button>
        <button 
          className={`${styles.tabBtn} ${activeTab === 'MODULE_TESTS' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('MODULE_TESTS')}
        >
          Module Tests
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
        </div>
      ) : dataList.length === 0 ? (
        <EmptyState 
          icon={<FiCheckSquare />}
          title={`No ${activeTab === 'EXAMS' ? 'Exams' : 'Module Tests'} Found`}
          description={`There are currently no records for your assigned cohorts in this category.`}
        />
      ) : (
        <Card>
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Course / Cohort</th>
                  <th>Level / Module</th>
                  <th>Score</th>
                  <th>Qualified</th>
                  <th>Status</th>
                  <th>Submitted On</th>
                </tr>
              </thead>
              <tbody>
                {dataList.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: "500" }}>{item.student_name || item.student?.first_name || 'Candidate'} {item.student?.last_name || ''}</td>
                    <td>
                      {item.course_name || item.test?.course?.name}<br />
                      <small style={{ color: "var(--text-secondary)" }}>{item.cohort_code || item.test?.cohort?.code || 'Unassigned'}</small>
                    </td>
                    <td>{item.level || item.test?.module?.title || '-'}</td>
                    <td>
                      {item.status === "COMPLETED" || item.status === "QUALIFIED" || item.status === "DISQUALIFIED" ? (
                        <>
                          <strong>{item.percentage}%</strong> ({item.marks_obtained}/{item.total_marks})
                        </>
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>-</span>
                      )}
                    </td>
                    <td>
                      {item.status === "COMPLETED" || item.status === "QUALIFIED" || item.status === "DISQUALIFIED" ? (
                        item.qualified ? <FiCheckSquare color="var(--success-color)" /> : <FiFileText color="var(--error-color)" />
                      ) : (
                         <span style={{ color: "var(--text-secondary)" }}>-</span>
                      )}
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination 
            page={page} 
            setPage={setPage} 
            hasNext={hasNext} 
            hasPrev={hasPrev} 
            loading={loading} 
          />
        </Card>
      )}
    </div>
  );
}

export default MentorAssessments;
