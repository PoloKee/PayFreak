"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { adminApi, getApiOrigin } from "@/lib/api";

export default function AdminEmailPage() {
  const { user, loading, isAdmin } = useAuth();
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupOut, setBackupOut] = useState<string | null>(null);

  const runBackup = async () => {
    setBackupBusy(true);
    setBackupOut(null);
    try {
      const r = await adminApi.runBackup();
      setBackupOut(JSON.stringify(r, null, 2));
    } catch (e) {
      setBackupOut(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBackupBusy(false);
    }
  };

  const sendTest = async () => {
    if (!to.trim()) {
      setMsg("Enter a recipient address.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminApi.emailTest(to.trim());
      setMsg(`Sent test to ${r.to}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Email</h1>
            <p className="text-secondary">Administrator sign-in required.</p>
            <Link href="/login" className="btn btn-pr-primary mt-2">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-1">Email &amp; notifications</h1>
            <p className="section-subtitle small mb-0">
              SMTP test, environment toggles, and system settings for automated mail.
            </p>
          </div>
          <Link href="/admin" className="btn btn-outline-secondary btn-sm">
            ← Admin home
          </Link>
        </div>

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-2">Send test email</h2>
          <p className="small text-secondary mb-3">
            Uses <code className="small">POST /api/admin/email/test</code>. Configure{" "}
            <code className="small">SMTP_HOST</code>, <code className="small">SMTP_USER</code>,{" "}
            <code className="small">SMTP_PASSWORD</code>, and optional{" "}
            <code className="small">SMTP_FROM</code> on the API server. For local dev without SMTP, set{" "}
            <code className="small">EMAIL_LOG_ONLY=true</code> to log payloads only.
          </p>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <input
              type="email"
              className="form-control form-control-sm"
              style={{ maxWidth: 280 }}
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <button type="button" className="btn btn-pr-primary btn-sm" disabled={busy} onClick={() => sendTest()}>
              {busy ? "Sending…" : "Send test"}
            </button>
          </div>
          {msg && <p className="small mt-3 mb-0">{msg}</p>}
        </div>

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-2">On-demand backup</h2>
          <p className="small text-secondary mb-3">
            <code className="small">POST /api/admin/backup/run</code> — SQLite file copy or PostgreSQL{" "}
            <code className="small">pg_dump</code> when available, plus gzipped archives of uploads and template
            gallery. Output directory: <code className="small">BACKUP_DIR</code> (default{" "}
            <code className="small">backups/</code> under the repo root).
          </p>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            disabled={backupBusy}
            onClick={() => runBackup()}
          >
            {backupBusy ? "Running…" : "Run backup now"}
          </button>
          {backupOut && (
            <pre className="small bg-light p-3 rounded mt-3 mb-0 overflow-auto" style={{ maxHeight: 240 }}>
              {backupOut}
            </pre>
          )}
        </div>

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-2">Automatic notifications</h2>
          <ul className="small text-secondary mb-0 ps-3">
            <li>
              <strong>Pay stub:</strong> after generation, email sends if{" "}
              <code className="small">email_paystub_notify</code> is <code className="small">true</code> in{" "}
              <Link href="/admin/settings">system settings</Link> or{" "}
              <code className="small">EMAIL_PAYSTUB_NOTIFY=true</code> in the environment. Employee must have an
              email; PDF attached when present.
            </li>
            <li className="mt-2">
              <strong>Welcome:</strong> on registration, if <code className="small">email_welcome_on_register</code>{" "}
              is true or <code className="small">EMAIL_WELCOME_ON_REGISTER=true</code>.
            </li>
            <li className="mt-2">
              <strong>Links:</strong> use <code className="small">APP_PUBLIC_URL</code> (e.g. your Next.js URL) so
              buttons point at the correct origin (currently API origin: <code className="small">{getApiOrigin()}</code>
              ).
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
