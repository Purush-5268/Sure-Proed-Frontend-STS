import React from 'react';
import styles from './WhySureProed.module.css';
import { FaGraduationCap, FaLaptopCode, FaCubes, FaAward, FaRocket } from 'react-icons/fa';

const WhySureProed = () => {
  const steps = [
    {
      icon: <FaGraduationCap />,
      title: "Learn",
      description: "Live classes from industry experts",
      colorClass: styles.colorPurple
    },
    {
      icon: <FaLaptopCode />,
      title: "Practice",
      description: "Hands-on assignments and labs",
      colorClass: styles.colorGreen
    },
    {
      icon: <FaCubes />,
      title: "Build",
      description: "Real-world projects and portfolio",
      colorClass: styles.colorTeal
    },
    {
      icon: <FaAward />,
      title: "Get Certified",
      description: "Earn recognised certificates",
      colorClass: styles.colorBlue
    },
    {
      icon: <FaRocket />,
      title: "Grow",
      description: "Placement support and career guidance",
      colorClass: styles.colorPink
    }
  ];

  return (
    <section id="features" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.badge}>WHY SURE PROED</div>
          <h2 className={styles.title}>One platform. Multiple ways to grow.</h2>
          <p className={styles.subtitle}>From live learning to real-world projects — everything you need to build your future.</p>
        </div>

        <div className={styles.journeyContainer}>
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <div className={`${styles.stepCard} ${styles[`stepCard${index + 1}`]}`}>
                <div className={styles.stepNumber}>0{index + 1}</div>
                <div className={`${styles.iconWrapper} ${step.colorClass}`}>
                  {step.icon}
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className={styles.connectorLine}>
                  <div className={styles.connectorFill}></div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhySureProed;