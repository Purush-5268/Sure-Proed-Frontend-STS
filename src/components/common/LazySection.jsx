import React, { useState, useEffect, useRef } from 'react';

const LazySection = ({ children, fallback, threshold = 0.1, id }) => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (sectionRef.current) {
            observer.unobserve(sectionRef.current);
          }
        }
      },
      { threshold }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, [threshold]);

  return (
    <div ref={sectionRef} id={id} style={{ minHeight: '1px' }}>
      {isVisible ? children : fallback}
    </div>
  );
};

export default LazySection;
