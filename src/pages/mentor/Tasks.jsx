import React, { useEffect, useState } from "react";
import apiClient, { fetchAllPages } from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import EmptyState from "../../components/ui/EmptyState";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import Pagination from "../../components/common/Pagination";
import styles from "./Tasks.module.css";
import { FiCheckSquare, FiClock } from "react-icons/fi";

function MentorTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const loadTasks = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get(API_ENDPOINTS.VOLUNTEER_TASKS.BASE, { params: { page } });
        const data = res.data;
        if (isMounted) {
          setTasks(Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []));
          setHasNext(!!data.next);
          setHasPrev(!!data.previous);
          setTotalCount(data.count || 0);
        }
      } catch (err) {
        console.error("Failed to load tasks:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadTasks();
    return () => { isMounted = false; };
  }, [page]);

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="primary">In Progress</Badge>;
      case 'BLOCKED':
        return <Badge variant="error">Blocked</Badge>;
      default:
        return <Badge variant="default">{status || 'Pending'}</Badge>;
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="My Tasks" 
        description="Track your assigned tasks and responsibilities."
      />

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
          <SkeletonLoader width="100%" height="80px" borderRadius="12px" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState 
          icon={<FiCheckSquare />}
          title="No Tasks Found"
          description="You currently have no tasks assigned to you."
        />
      ) : (
        <Card>
          <div className="premium-table-container">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Task Title</th>
                  <th>Description</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id}>
                    <td style={{ fontWeight: "500" }}>{task.title}</td>
                    <td>{task.description?.substring(0, 50)}{task.description?.length > 50 ? '...' : ''}</td>
                    <td>
                      <Badge variant={task.priority === 'HIGH' ? 'error' : task.priority === 'MEDIUM' ? 'warning' : 'default'}>
                        {task.priority || 'NORMAL'}
                      </Badge>
                    </td>
                    <td>{getStatusBadge(task.status)}</td>
                    <td>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {!loading && tasks.length > 0 && (
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

export default MentorTasks;
