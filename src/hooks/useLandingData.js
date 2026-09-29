import { useState, useEffect } from 'react';
import { cohortService } from '../services/cohortService';
import { courseService } from '../services/courseService';

import apiClient from '../services/apiClient';
import { API_ENDPOINTS } from '../constants/apiEndpoints';
import { companyService } from '../services/companyService';

export const useLandingData = () => {
  const [data, setData] = useState({
    cohorts: [],
    courses: [],
    stats: null,
    companies: [],
    loading: true,
    error: null
  });

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        const timestamp = new Date().getTime();
        // Fetch only public authoritative data
        const [cohortsRes, coursesRes, statsRes, companiesRes] = await Promise.all([
          cohortService.getCohorts({ public_all: 'true' }, { signal: abortController.signal }),
          courseService.getCourses({ signal: abortController.signal }),
          apiClient.get(`${API_ENDPOINTS.ANALYTICS.PLATFORM_STATS}?t=${timestamp}`, { signal: abortController.signal }).catch(() => null),
          companyService.getCompanies({ limit: 50 }).catch(() => null)
        ]);

        if (!isMounted) return;

        const cohortsList = Array.isArray(cohortsRes) ? cohortsRes : cohortsRes.results || [];
        const coursesList = Array.isArray(coursesRes) ? coursesRes : coursesRes.results || [];
        const statsData = statsRes ? statsRes.data : null;
        const companiesList = companiesRes ? (companiesRes.results || companiesRes) : [];

        setData({
          cohorts: cohortsList,
          courses: coursesList,
          stats: statsData,
          companies: companiesList,
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
