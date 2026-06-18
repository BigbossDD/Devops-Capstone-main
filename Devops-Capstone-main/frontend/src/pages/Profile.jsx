import React, { useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";
import { updateProfile, changePassword } from "../api/auth.js";

export default function Profile() {
  const { user, refreshProfile } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [address, setAddress] = useState(user?.address || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ email, full_name: fullName, address });
      await refreshProfile();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed. Please log in again on other devices.");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not change password");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="section-heading">My profile</h1>

      <div className="card">
        <h2 className="font-semibold text-ink-950">Account details</h2>
        <p className="mt-1 text-sm text-ink-500">
          Username: <span className="font-medium text-ink-700">{user?.username}</span> &middot;{" "}
          Role: <span className="font-medium text-ink-700">{user?.role}</span>
        </p>
        <form className="mt-4 space-y-4" onSubmit={handleProfileSubmit}>
          <div>
            <label className="field-label">Email</label>
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Full name</label>
            <input
              className="input-field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Shipping address</label>
            <textarea
              className="input-field"
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-950">Change password</h2>
        <p className="field-hint mt-1">
          Changing your password signs you out everywhere else.
        </p>
        <form className="mt-4 space-y-4" onSubmit={handlePasswordSubmit}>
          <div>
            <label className="field-label">Current password</label>
            <input
              className="input-field"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">New password (min 6 characters)</label>
            <input
              className="input-field"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <button className="btn-primary" type="submit" disabled={savingPassword}>
            {savingPassword ? "Updating..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
