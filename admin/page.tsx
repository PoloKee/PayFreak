"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { AdminStats, adminApi, agentsApi } from "@/lib/api";

export default function AdminPortalPage() {
  const { user, loading, isAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [agents, setAgents] = useState<unknown>(null);
  const [dbOk, setDbOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const s = await adminApi.stats();
        if (!cancelled) setStats(s);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load stats");
      }
      try {
        const d = await adminApi.healthDb();
        if (!cancelled) setDbOk(d.database);
      } catch {
        if (!cancelled) setDbOk(null);
      }
      try {
        const a = await agentsApi.getStatus();
        if (!cancelled) setAgents(a);
      } catch {
        if (!cancelled) setAgents(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

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
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Admin</h1>
            <p className="text-secondary mb-3">Administrator sign-in required.</p>
            <Link href="/login" className="btn btn-pr-primary">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Admin</h1>
            <p className="text-secondary mb-0">Your role does not have access to admin metrics.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-10">
        <h1 className="h2 fw-bold section-title mb-2">Admin overview</h1>
        <p className="section-subtitle mb-4">
          Data from <code className="small">GET /api/admin/stats</code> and{" "}
          <code className="small">GET /api/agents/status</code>.
        </p>
        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        {dbOk && (
          <p className="small text-success mb-3">
            Database ping: <strong>{dbOk}</strong> (<code className="small">/api/admin/health/db</code>)
          </p>
        )}
        {stats && (
          <div className="row g-3 mb-4">
            {(
              [
                ["Users", stats.users],
                ["Employees", stats.employees],
                ["Active templates", stats.templates_active],
                ["Pay stubs", stats.pay_stubs_total],
                ["Bank statements", stats.bank_statements_total],
                ["Uploads", stats.uploaded_documents],
                ["Stubs this month", stats.documents_this_month],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="col-6 col-md-4 col-lg-3">
                <div className="p-3 rounded border bg-white h-100 text-center">
                  <div className="display-6 fw-bold text-primary">{n}</div>
                  <div className="small text-secondary">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="row g-3 mb-4">
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Employers</h2>
              <p className="small text-secondary mb-3">
                Company records; delete blocked while employees reference them.
              </p>
              <Link href="/admin/employers" className="btn btn-outline-primary btn-sm">
                Open employer table
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Employees</h2>
              <p className="small text-secondary mb-3">
                Browse, edit, and delete employees (Flask CRUD).
              </p>
              <Link href="/admin/employees" className="btn btn-outline-primary btn-sm">
                Open employee table
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Templates</h2>
              <p className="small text-secondary mb-3">
                Register from disk, sync fields, duplicate or remove DB rows.
              </p>
              <Link href="/admin/templates" className="btn btn-outline-primary btn-sm">
                Open template admin
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Batch pay stubs</h2>
              <p className="small text-secondary mb-3">
                Select employees and generate stubs with one pay period via the REST API.
              </p>
              <Link href="/admin/generate" className="btn btn-outline-primary btn-sm">
                Open batch generation
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">PDF upload</h2>
              <p className="small text-secondary mb-3">
                Process PDFs through <code className="small">/api/process/pdf</code> (extract + stored paths).
              </p>
              <Link href="/admin/upload" className="btn btn-outline-primary btn-sm">
                Open PDF upload
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">System settings</h2>
              <p className="small text-secondary mb-3">
                Key/value <code className="small">system_settings</code> and backup instructions.
              </p>
              <Link href="/admin/settings" className="btn btn-outline-primary btn-sm">
                Open settings
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Database</h2>
              <p className="small text-secondary mb-3">
                Table counts, schema, paginated row preview, default company, and DB health.
              </p>
              <Link href="/admin/database" className="btn btn-outline-primary btn-sm">
                Open database
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Analytics</h2>
              <p className="small text-secondary mb-3">
                Payroll dashboard, monthly trends, tax-style deduction rollups, per-employee summaries.
              </p>
              <Link href="/admin/analytics" className="btn btn-outline-primary btn-sm">
                Open analytics
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Email &amp; backup</h2>
              <p className="small text-secondary mb-3">
                SMTP test, notification toggles, and on-demand backup bundle (DB + uploads + templates).
              </p>
              <Link href="/admin/email" className="btn btn-outline-primary btn-sm me-2">
                Email / backup
              </Link>
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Monitoring</h2>
              <p className="small text-secondary mb-3">
                Health, readiness, system metrics, OpenAPI spec link, agent status.
              </p>
              <Link href="/admin/monitoring" className="btn btn-outline-primary btn-sm">
                Open monitoring
              </Link>
            </div>
          </div>
        </div>

        <div className="form-card">
          <h2 className="h6 fw-bold mb-2">Agents</h2>
          <pre className="small bg-light p-3 rounded mb-0 overflow-auto" style={{ maxHeight: 320 }}>
            {agents != null ? JSON.stringify(agents, null, 2) : "Unavailable (check JWT / orchestrator)."}
          </pre>
        </div>
      </div>
    </div>
  );
}
