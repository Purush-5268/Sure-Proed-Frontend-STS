import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Card from "../../../components/ui/Card";
import RichTextEditor from "./RichTextEditor";
import FileUpload from "./FileUpload";
import styles from "./CreateAssignment.module.css";
import { FiSave, FiSend } from "react-icons/fi";

const CreateAssignment = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: "",
    cohort: "",
    dueDate: "",
    points: 100,
  });
  const [content, setContent] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveDraft = () => {
    // Just relying on the RichTextEditor's internal localStorage autosave for now,
    // plus we could save the rest of formData to localStorage here if we want.
    alert("Draft saved locally.");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.cohort || !formData.dueDate) {
      alert("Please fill in all required fields.");
      return;
    }
    
    setLoading(true);
    try {
      // TODO: BACKEND REQUIRED
      // 1. Upload files first if any, getting their URLs/IDs.
      // 2. Create the assignment record via POST /api/assignments
      // mentorAssignmentService or similar will handle this once backend is ready.
      
      console.warn("Assignment creation is mocked due to missing backend endpoints.");
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clear local storage draft
      localStorage.removeItem("draft_assignment_content");
      
      navigate("/mentor/assignments");
    } catch (error) {
      console.error("Failed to create assignment:", error);
      alert("Failed to create assignment. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Create Assignment" 
        description="Draft and publish a new assignment for your cohorts."
        actions={
          <div className={styles.actions}>
            <button 
              type="button" 
              className={styles.secondaryBtn} 
              onClick={handleSaveDraft}
              disabled={loading}
            >
              <FiSave /> Save Draft
            </button>
            <button 
              type="submit" 
              form="assignment-form" 
              className={styles.primaryBtn}
              disabled={loading}
            >
              <FiSend /> {loading ? "Publishing..." : "Publish Assignment"}
            </button>
          </div>
        }
      />

      <form id="assignment-form" onSubmit={handleSubmit} className={styles.formGrid}>
        <div className={styles.mainCol}>
          <Card className={styles.card}>
            <div className={styles.formGroup}>
              <label htmlFor="title">Assignment Title <span className={styles.required}>*</span></label>
              <input 
                type="text" 
                id="title"
                name="title" 
                value={formData.title} 
                onChange={handleChange} 
                className={styles.input}
                placeholder="e.g., Week 1: Introduction to React"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Instructions</label>
              <RichTextEditor 
                content={content} 
                onChange={setContent} 
                storageKey="draft_assignment_content" 
              />
            </div>
          </Card>

          <Card className={styles.card}>
            <div className={styles.formGroup}>
              <label>Reference Materials & Attachments</label>
              <FileUpload onFilesChange={setFiles} />
            </div>
          </Card>
        </div>

        <div className={styles.sideCol}>
          <Card className={styles.card}>
            <h3 className={styles.sideTitle}>Settings</h3>
            
            <div className={styles.formGroup}>
              <label htmlFor="cohort">Target Cohort <span className={styles.required}>*</span></label>
              <select 
                id="cohort"
                name="cohort" 
                value={formData.cohort} 
                onChange={handleChange} 
                className={styles.input}
                required
              >
                <option value="">Select a cohort...</option>
                {/* Real cohorts will be populated here */}
                <option value="1">Frontend Engineering 101</option>
                <option value="2">Backend Python Batch A</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="dueDate">Due Date <span className={styles.required}>*</span></label>
              <input 
                type="datetime-local" 
                id="dueDate"
                name="dueDate" 
                value={formData.dueDate} 
                onChange={handleChange} 
                className={styles.input}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="points">Total Points</label>
              <input 
                type="number" 
                id="points"
                name="points" 
                value={formData.points} 
                onChange={handleChange} 
                className={styles.input}
                min="0"
                max="1000"
              />
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
};

export default CreateAssignment;
