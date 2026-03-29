"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { authApi, employeesApi } from "@/lib/api";

export default function EmployeeProfilePage() {
  const { user, loading, isEmployee, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address_line1: "",
    city: "",
    state: "",
    zip_code: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    const e = user?.employee;
    if (!e) return;
    setForm({
      first_name: e.first_name ?? "",
      last_name: e.last_name ?? "",
      email: user.email ?? "",
      phone: e.phone ?? "",
      address_line1: e.address_line1 ?? "",
      city: e.city ?? "",
      state: e.state ?? "",
      zip_code: e.zip_code ?? "",
    });
  }, [user]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const empId = user?.employee?.id;
    if (empId == null) {
      setErr("No employee profile is linked to this account.");
      return;
    }
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await employeesApi.update(empId, {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        address_line1: form.address_line1 || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zip_code || null,
      });
      setMsg("Profile updated.");
      setEditing(false);
      await refreshUser();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setPwErr(null);
    setPwOk(null);
    if (pwNew.length < 8) {
      setPwErr("New password must be at least 8 characters.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwErr("New password and confirmation do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await authApi.changePassword(pwOld, pwNew);
      setPwOld("");
      setPwNew("");
      setPwConfirm("");
      setPwOk("Password updated.");
      setShowPw(false);
    } catch (ex) {
      setPwErr(ex instanceof Error ? ex.message : "Could not update password");
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user || !isEmployee) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Profile</h1>
            <p className="text-secondary mb-3">Employee sign-in required.</p>
            <Link href="/login" className="btn btn-pr-primary">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!user.employee?.id) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Profile</h1>
            <p className="text-secondary mb-3">
              Your user is not linked to an <code className="small">employees</code> row. Register as employee or ask an
              admin to set your <code className="small">user_id</code>.
            </p>
            <Link href="/portal/employee" className="btn btn-outline-primary btn-sm">
              Back to portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8">
        <nav className="mb-3 small">
          <Link href="/portal/employee" className="text-decoration-none">
            Employee portal
          </Link>
          <span className="text-muted mx-2">·</span>
          <span className="fw-semibold text-primary">Profile</span>
        </nav>

        <h1 className="h2 fw-bold section-title mb-2">My profile</h1>
        <p className="section-subtitle mb-4">
          Updates <code className="small">PUT /api/employees/{user.employee.id}</code>. Password changes live on{" "}
          <Link href="/account">Account</Link>.
        </p>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        {msg && <div className="alert alert-success py-2 small mb-3">{msg}</div>}

        <div className="form-card mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h6 fw-bold mb-0">Contact &amp; address</h2>
            {!editing ? (
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
          <form onSubmit={onSave}>
            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small">First name</label>
                <input
                  className="form-control form-control-sm"
                  value={form.first_name}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Last name</label>
                <input
                  className="form-control form-control-sm"
                  value={form.last_name}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Email</label>
                <input
                  type="email"
                  className="form-control form-control-sm"
                  value={form.email}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Phone</label>
                <input
                  className="form-control form-control-sm"
                  value={form.phone}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Address line 1</label>
                <input
                  className="form-control form-control-sm"
                  value={form.address_line1}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">City</label>
                <input
                  className="form-control form-control-sm"
                  value={form.city}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">State</label>
                <input
                  className="form-control form-control-sm"
                  value={form.state}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">ZIP</label>
                <input
                  className="form-control form-control-sm"
                  value={form.zip_code}
                  disabled={!editing}
                  onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
                />
              </div>
            </div>
            {editing && (
              <button type="submit" className="btn btn-pr-primary btn-sm mt-3" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            )}
          </form>
        </div>

        <div className="form-card">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h2 className="h6 fw-bold mb-0">Change password</h2>
            {!showPw && (
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowPw(true)}>
                Show form
              </button>
            )}
          </div>
          {showPw && (
            <form onSubmit={onPassword}>
              {pwErr && <div className="alert alert-danger py-2 small mb-2">{pwErr}</div>}
              {pwOk && <div className="alert alert-success py-2 small mb-2">{pwOk}</div>}
              <div className="mb-2">
                <label className="form-label small">Current password</label>
                <input
                  type="password"
                  className="form-control form-control-sm"
                  value={pwOld}
                  onChange={(e) => setPwOld(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="mb-2">
                <label className="form-label small">New password</label>
                <input
                  type="password"
                  className="form-control form-control-sm"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="mb-3">
                <label className="form-label small">Confirm new password</label>
                <input
                  type="password"
                  className="form-control form-control-sm"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button type="submit" className="btn btn-pr-primary btn-sm" disabled={pwBusy}>
                  {pwBusy ? "Updating…" : "Update password"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setShowPw(false);
                    setPwErr(null);
                  }}
                >
                  Cancel
                </button>
                <Link href="/account" className="btn btn-link btn-sm">
                  Account page
                </Link>
              </div>
            </form>
          )}
          {!showPw && (
            <p className="small text-secondary mb-0">
              Same as <Link href="/account">Account</Link> — at least 8 characters.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
