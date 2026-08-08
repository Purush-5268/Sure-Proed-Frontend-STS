import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { API_ENDPOINTS } from "../../constants/apiEndpoints";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import SkeletonLoader from "../../components/common/SkeletonLoader";
import styles from "./Profile.module.css";
import { FiUser, FiLinkedin, FiBriefcase, FiCheck, FiAlertCircle } from "react-icons/fi";

// Profile completion fields and their weights
const PROFILE_FIELDS = [
  { key: "first_name", label: "First Name", source: "user" },
  { key: "last_name", label: "Last Name", source: "user" },
  { key: "email", label: "Email", source: "user" },
  { key: "phone_number", label: "Phone Number", source: "user" },
  { key: "linkedin_url", label: "LinkedIn URL", source: "profile" },
  { key: "experience_years", label: "Experience", source: "profile" },
];

function computeCompletion(user, profile) {
  let filled = 0;
  PROFILE_FIELDS.forEach(f => {
    const src = f.source === "user" ? user : profile;
    if (src && src[f.key]) filled++;
  });
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

function Profile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({ linkedin_url: "", experience_years: "", course: null });
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "" });
  const [profileForm, setProfileForm] = useState({ linkedin_url: "", experience_years: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      try {
        // Load user's base info
        const userRes = await apiClient.get(API_ENDPOINTS.USERS.ME);
        // Load mentor-specific profile
        const profileRes = await apiClient.get(API_ENDPOINTS.MENTORS.PROFILE_ME).catch(() => ({ data: {} }));

        if (!isMounted) return;

        const userData = userRes.data;
        const profileData = profileRes.data;

        setForm({
          first_name: userData.first_name || "",
          last_name: userData.last_name || "",
          email: userData.email || "",
          phone_number: userData.phone_number || "",
        });
        setProfile(profileData);
        setProfileForm({
          linkedin_url: profileData.linkedin_url || "",
          experience_years: profileData.experience_years || "",
        });
      } catch {
        // Use user from auth context as fallback
        if (user && isMounted) {
          setForm({
            first_name: user.first_name || "",
            last_name: user.last_name || "",
            email: user.email || "",
            phone_number: user.phone_number || "",
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadProfile();
    return () => { isMounted = false; };
  }, [user]);

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) { setError("Your profile could not be loaded."); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      // Save base user info
      const userRes = await apiClient.patch(API_ENDPOINTS.USERS.BY_ID(user.id), {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim() || null,
      });

      // Save mentor profile fields
      await apiClient.patch(API_ENDPOINTS.MENTORS.PROFILE_ME, {
        linkedin_url: profileForm.linkedin_url.trim() || null,
        experience_years: profileForm.experience_years.trim() || null,
      });

      updateUser({
        first_name: userRes.data.first_name,
        last_name: userRes.data.last_name,
        phone_number: userRes.data.phone_number,
      });

      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const completionPct = computeCompletion(
    { ...form, email: form.email },
    profileForm
  );

  const fullName = `${form.first_name} ${form.last_name}`.trim() || form.email || "Mentor";

  if (loading) {
    return (
      <div className={styles.container}>
        <PageHeader title="My Profile" />
        <div className={styles.skeletonGrid}>
          <SkeletonLoader width="100%" height="200px" borderRadius="16px" />
          <SkeletonLoader width="100%" height="400px" borderRadius="16px" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader title="My Profile" description="Your professional mentor profile." />

      <div className={styles.layout}>
        {/* Left: Profile Card */}
        <div className={styles.leftCol}>
          <Card className={styles.profileCard}>
            <div className={styles.avatarSection}>
              <div className={styles.avatarLarge}>
                {fullName.charAt(0).toUpperCase()}
              </div>
              <h2 className={styles.profileName}>{fullName}</h2>
              <p className={styles.profileRole}>Mentor</p>
              {profile?.course_name && (
                <span className={styles.coursePill}>{profile.course_name}</span>
              )}
            </div>

            {/* Completion Meter */}
            <div className={styles.completionSection}>
              <div className={styles.completionHeader}>
                <span className={styles.completionLabel}>Profile Completion</span>
                <span className={styles.completionPct}>{completionPct}%</span>
              </div>
              <div className={styles.progressTrack}>
                <motion.div
                  className={styles.progressFill}
                  initial={{ width: 0 }}
                  animate={{ width: `${completionPct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{
                    background: completionPct === 100
                      ? "linear-gradient(90deg, #10b981, #059669)"
                      : "linear-gradient(90deg, var(--primary-color), var(--accent-color))"
                  }}
                />
              </div>
            </div>

            {/* Field Checklist */}
            <div className={styles.checklist}>
              {PROFILE_FIELDS.map(f => {
                const src = f.source === "user" ? form : profileForm;
                const filled = !!src[f.key];
                return (
                  <div key={f.key} className={`${styles.checkItem} ${filled ? styles.filled : ""}`}>
                    <div className={styles.checkIcon}>
                      {filled ? <FiCheck /> : <span />}
                    </div>
                    <span>{f.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right: Edit Form */}
        <div className={styles.rightCol}>
          <Card className={styles.formCard}>
            <form onSubmit={handleSubmit}>
              <h3 className={styles.sectionTitle}>
                <FiUser /> Personal Information
              </h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>First Name</label>
                  <input className={styles.input} type="text" name="first_name" value={form.first_name} onChange={handleUserChange} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Last Name</label>
                  <input className={styles.input} type="text" name="last_name" value={form.last_name} onChange={handleUserChange} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Email</label>
                  <input className={styles.input} type="email" name="email" value={form.email} readOnly disabled />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Phone Number</label>
                  <input className={styles.input} type="text" name="phone_number" value={form.phone_number} onChange={handleUserChange} />
                </div>
              </div>

              <h3 className={styles.sectionTitle} style={{ marginTop: "1.5rem" }}>
                <FiBriefcase /> Professional Details
              </h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Experience (years)</label>
                  <input className={styles.input} type="text" name="experience_years" value={profileForm.experience_years} onChange={handleProfileChange} placeholder="e.g. 5 years" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <FiLinkedin style={{ display: "inline", marginRight: "4px" }} />
                    LinkedIn URL
                  </label>
                  <input className={styles.input} type="url" name="linkedin_url" value={profileForm.linkedin_url} onChange={handleProfileChange} placeholder="https://linkedin.com/in/yourname" />
                </div>
              </div>

              {error && (
                <div className={styles.errorMsg}>
                  <FiAlertCircle /> {error}
                </div>
              )}
              {success && (
                <div className={styles.successMsg}>
                  <FiCheck /> {success}
                </div>
              )}

              <div className={styles.formActions}>
                <button type="submit" disabled={saving} className={styles.saveBtn}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Profile;
