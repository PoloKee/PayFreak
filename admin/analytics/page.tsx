"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { adminApi } from "@/lib/api";

export default function AdminAnalyticsPage() {
  const { user, loading, isAdmin } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.analyticsDashboard>> | null>(
    null
  );
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [tax, setTax] = useState<Record<string, unknown> | null>(null);
  const [empId, setEmpId] = useState("");
  const [empSummary, setEmpSummary] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;
    let c = false;
    (async () => {
      setErr(null);
      try {
        const d = await adminApi.analyticsDashboard(12);
        if (!c) setData(d);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      c = true;
    };
  }, [user, isAdmin]);

  const loadTax = async () => {
    if (!isAdmin) return;
    setErr(null);
    try {
      const y = parseInt(taxYear, 10);
      setTax(await adminApi.analyticsTaxSummary(Number.isFinite(y) ? y : undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Tax summary failed");
    }
  };

  const loadEmployee = async () => {
    if (!isAdmin || !empId.trim()) return;
    setErr(null);
    try {
      setEmpSummary(await adminApi.analyticsEmployee(Number(empId)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Employee summary failed");
      setEmpSummary(null);
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
            <h1 className="h3 fw-bold mb-2">Analytics</h1>
            <p className="text-secondary">Administrator sign-in required.</p>
            <Link href="/login" className="btn btn-pr-primary mt-2">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const dash = data?.dashboard;

  return (
    <div className="row justify-content-center">
      <div className="col-12 col-xl-11">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-1">Analytics</h1>
            <p className="section-subtitle small mb-0">
              Payroll aggregates, 12-month trends, per-employee pay stub rollups, and withholding-style
              totals from deduction JSON.
            </p>
          </div>
          <Link href="/admin" className="btn btn-outline-secondary btn-sm">
            ← Admin home
          </Link>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}

        {dash && (
          <div className="form-card mb-4">
            <h2 className="h6 fw-bold mb-3">Dashboard</h2>
            <div className="row g-2 small">
              {Object.entries(dash).map(([k, v]) => (
                <div key={k} className="col-6 col-md-4 col-lg-3">
                  <div className="border rounded p-2 h-100 bg-white bg-opacity-50">
                    <div className="text-secondary text-capitalize">{k.replace(/_/g, " ")}</div>
                    <div className="fw-bold text-primary">{String(v)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data?.payroll_trends && data.payroll_trends.length > 0 && (
          <div className="form-card mb-4">
            <h2 className="h6 fw-bold mb-3">Payroll trends</h2>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-end">Gross</th>
                    <th className="text-end">Net</th>
                    <th className="text-end">Stubs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payroll_trends.map((row) => (
                    <tr key={row.month}>
                      <td>
                        <code className="small">{row.month}</code>
                      </td>
                      <td className="text-end">{row.total_gross.toLocaleString()}</td>
                      <td className="text-end">{row.total_net.toLocaleString()}</td>
                      <td className="text-end">{row.paystub_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-3">Tax / deduction summary by year</h2>
          <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <div>
              <label className="form-label small mb-0">Year</label>
              <input
                className="form-control form-control-sm"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                style={{ width: 100 }}
              />
            </div>
            <button type="button" className="btn btn-pr-primary btn-sm" onClick={() => loadTax()}>
              Load
            </button>
          </div>
          {tax && (
            <pre className="small bg-light p-3 rounded mb-0 overflow-auto" style={{ maxHeight: 280 }}>
              {JSON.stringify(tax, null, 2)}
            </pre>
          )}
        </div>

        <div className="form-card">
          <h2 className="h6 fw-bold mb-3">Employee pay stub summary</h2>
          <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
            <div>
              <label className="form-label small mb-0">Employee ID (numeric)</label>
              <input
                className="form-control form-control-sm"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                placeholder="e.g. 1"
                style={{ width: 140 }}
              />
            </div>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => loadEmployee()}>
              Load
            </button>
          </div>
          {empSummary && (
            <pre className="small bg-light p-3 rounded mb-0 overflow-auto" style={{ maxHeight: 360 }}>
              {JSON.stringify(empSummary, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
