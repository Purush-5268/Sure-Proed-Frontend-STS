import React, { useState, useRef } from "react";
import styles from "./FileUpload.module.css";
import { FiUploadCloud, FiX, FiFile } from "react-icons/fi";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/zip",
  "application/x-rar-compressed",
  "image/jpeg",
  "image/png"
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const FileUpload = ({ onFilesChange, existingFiles = [] }) => {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndAddFiles = (newFiles) => {
    setError("");
    const validFiles = [];

    Array.from(newFiles).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Invalid file type: ${file.name}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large: ${file.name} (Max 10MB)`);
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      const updatedFiles = [...files, ...validFiles];
      setFiles(updatedFiles);
      onFilesChange(updatedFiles);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndAddFiles(e.target.files);
    }
  };

  const removeFile = (index) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFilesChange(updated);
  };

  return (
    <div className={styles.uploadContainer}>
      <div 
        className={`${styles.dropZone} ${dragActive ? styles.dragActive : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <FiUploadCloud className={styles.uploadIcon} />
        <p className={styles.uploadText}>
          <span className={styles.highlight}>Click to upload</span> or drag and drop
        </p>
        <p className={styles.uploadSubtext}>PDF, DOCX, PPT, ZIP, RAR or Images (Max. 10MB)</p>
        <input 
          ref={inputRef}
          type="file" 
          multiple 
          onChange={handleChange}
          className={styles.fileInput}
          accept=".pdf,.docx,.ppt,.pptx,.zip,.rar,image/jpeg,image/png"
        />
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      {files.length > 0 && (
        <ul className={styles.fileList}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className={styles.fileItem}>
              <div className={styles.fileInfo}>
                <FiFile className={styles.fileIcon} />
                <span className={styles.fileName}>{file.name}</span>
                <span className={styles.fileSize}>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
              <button 
                type="button" 
                onClick={() => removeFile(index)}
                className={styles.removeBtn}
                aria-label="Remove file"
              >
                <FiX />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileUpload;
