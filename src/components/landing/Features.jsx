import styles from "./Features.module.css";
import { FaUserGraduate, FaChalkboardTeacher, FaChartLine, FaBriefcase, FaCode, FaRocket } from "react-icons/fa";

function Features() {
  const features = [
    {
      icon: <FaCode />,
      title: "Learn Industry Skills",
      description: "Master modern tech stacks and tools. Build production-ready projects that stand out to top tech companies."
    },
    {
      icon: <FaBriefcase />,
      title: "Crack Dream Placements",
      description: "Gain hands-on internship experience, craft an industry-ready portfolio, and receive dedicated placement support."
    },
    {
      icon: <FaChalkboardTeacher />,
      title: "Real Mentor Guidance",
      description: "Learn directly from industry experts. Receive personalized feedback and embark on a guided certification journey."
    },
    {
      icon: <FaRocket />,
      title: "Future Ready Skills",
      description: "Leverage AI-powered learning to track your progress, accelerate your career growth, and stay ahead of the curve."
    }
  ];

  return (
    <section id="features" className={styles.features}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Accelerate Your <span className={styles.highlight}>Career Growth</span></h2>
          <p>Everything you need to transform your potential into a successful tech career.</p>
        </div>

        <div className={styles.grid}>
          {features.map((feature, index) => (
            <div key={index} className={styles.card}>
              <div className={styles.iconWrapper}>
                {feature.icon}
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Features;