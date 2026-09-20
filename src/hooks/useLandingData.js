import { useState, useEffect } from 'react';
import { cohortService } from '../services/cohortService';
import { courseService } from '../services/courseService';

export const useLandingData = () => {
  const [data, setData] = useState({
    cohorts: [],
    courses: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        // Fetch only public authoritative data
        const [cohortsRes, coursesRes] = await Promise.all([
          cohortService.getCohorts({ status: 'OPEN' }, { signal: abortController.signal }),
          courseService.getCourses({ signal: abortController.signal })
        ]);

        if (!isMounted) return;

        const cohortsList = Array.isArray(cohortsRes) ? cohortsRes : cohortsRes.results || [];
        const coursesList = Array.isArray(coursesRes) ? coursesRes : coursesRes.results || [];

        // Filter active cohorts
        const now = new Date();
        const activeCohorts = cohortsList.filter(c => !c.application_end_date || new Date(c.application_end_date) > now);

        setData({
          cohorts: activeCohorts,
          courses: coursesList,
          loading: false,
          error: null
        });
      } catch (error) {
        if (!isMounted) return;
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error("Error fetching landing data", error);
          setData(prev => ({ ...prev, loading: false, error: "Failed to load data" }));
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  return data;
};
