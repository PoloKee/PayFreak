"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { authApi } from "@/lib/api";

export default function AccountPage() {
  const { user, loading } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirm("");
      setSuccess("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-md-6">
          <div className="form-card">
            <h1 className="h4 fw-bold mb-2">Account</h1>
            <p className="text-secondary small mb-3">Sign in to change your password.</p>
            <Link href="/login" className="btn btn-pr-primary btn-sm">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center py-4">
      <div className="col-md-6">
        <div className="form-card">
          <h1 className="h4 fw-bold mb-1">Account</h1>
          <p className="text-secondary small mb-4">
            Signed in as <span className="text-body">{user.email}</span> ({user.role}).
          </p>
          <h2 className="h6 fw-bold mb-3">Change password</h2>
          {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}
          {success && <div className="alert alert-success py-2 small mb-3">{success}</div>}
          <form onSubmit={onSubmit}>
            <div className="mb-3">
              <label className="form-label small">Current password</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="mb-3">
              <label className="form-label small">New password</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="form-text small mb-0">At least 8 characters.</p>
            </div>
            <div className="mb-3">
              <label className="form-label small">Confirm new password</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn btn-pr-primary btn-sm" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
