"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import PayStubDataSummary from "@/components/PayStubDataSummary";
import { dateInRange, periodOverlapsRange } from "@/lib/dateRange";
import { downloadRowsAsCsv } from "@/lib/csvExport";
import { apiFetchBlob, getApiOrigin, paystubsApi } from "@/lib/api";

type StubRow = {
  id: number;
  employee_id: number;
  pay_period_start: string | null;
  pay_period_end: string | null;
  pay_date: string | null;
  gross_pay: number | null;
  net_pay: number | null;
};

export default function EmployeePortalPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<StubRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailJson, setDetailJson] = useState<string | null>(null);
  const [detailPayload, setDetailPayload] = useState<Record<string, unknown> | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [jsonCopyMsg, setJsonCopyMsg] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setErr(null);
    try {
      const res = await paystubsApi.getAll();
      setRows((res.paystubs as StubRow[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load pay stubs");
      setRows([]);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const years = useMemo(() => {
    const y = new Set<number>();
    for (const r of rows) {
      if (r.pay_date && r.pay_date.length >= 4) {
        const n = parseInt(r.pay_date.slice(0, 4), 10);
        if (!Number.isNaN(n)) y.add(n);
      }
    }
    return Array.from(y).sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filterYear) {
      out = out.filter((r) => (r.pay_date || "").startsWith(filterYear));
    }
    if (filterDateFrom || filterDateTo) {
      out = out.filter((r) => {
        const byPay =
          Boolean(r.pay_date) &&
          dateInRange(r.pay_date, filterDateFrom, filterDateTo);
        const byPeriod = periodOverlapsRange(
          r.pay_period_start,
          r.pay_period_end,
          filterDateFrom,
          filterDateTo
        );
        return byPay || byPeriod;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          String(r.id).includes(q) ||
          (r.pay_date || "").toLowerCase().includes(q) ||
          (r.pay_period_start || "").toLowerCase().includes(q) ||
          (r.pay_period_end || "").toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) => (b.pay_date || "").localeCompare(a.pay_date || ""));
  }, [rows, filterYear, filterDateFrom, filterDateTo, search]);

  async function copyDetailJson() {
    if (!detailJson) return;
    try {
      await navigator.clipboard.writeText(detailJson);
      setJsonCopyMsg("Copied.");
      setTimeout(() => setJsonCopyMsg(null), 2000);
    } catch {
      setJsonCopyMsg("Copy failed.");
      setTimeout(() => setJsonCopyMsg(null), 3000);
    }
  }

  async function loadDetail(id: number) {
    if (detailId === id && detailJson) {
      setDetailId(null);
      setDetailJson(null);
      setDetailPayload(null);
      setJsonCopyMsg(null);
      return;
    }
    setDetailBusy(true);
    setErr(null);
    try {
      const data = (await paystubsApi.getOne(id)) as Record<string, unknown>;
      setDetailId(id);
      setDetailPayload(data);
      setDetailJson(JSON.stringify(data, null, 2));
      setJsonCopyMsg(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load detail");
      setDetailId(null);
      setDetailJson(null);
      setDetailPayload(null);
    } finally {
      setDetailBusy(false);
    }
  }

  function exportFilteredCsv() {
    const headers = [
      "id",
      "employee_id",
      "pay_period_start",
      "pay_period_end",
      "pay_date",
      "gross_pay",
      "net_pay",
    ];
    const data = filtered.map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      pay_period_start: r.pay_period_start,
      pay_period_end: r.pay_period_end,
      pay_date: r.pay_date,
      gross_pay: r.gross_pay,
      net_pay: r.net_pay,
    })) as Record<string, unknown>[];
    downloadRowsAsCsv(headers, data, "pay-stubs");
  }

  async function downloadStub(id: number, fmt: "pdf" | "html") {
    setDlBusy(id);
    try {
      const blob = await apiFetchBlob(`/paystubs/${id}/download/${fmt}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paystub-${id}.${fmt === "pdf" ? "pdf" : "html"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDlBusy(null);
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
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Employee portal</h1>
            <p className="text-secondary mb-3">Sign in to see pay stubs linked to your user.</p>
            <Link href="/login" className="btn btn-pr-primary">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const dataForSummary = detailPayload?.data;

  return (
    <div className="row justify-content-center">
      <div className="col-lg-10">
        <nav className="mb-3 small">
          <span className="fw-semibold text-primary">Pay stubs</span>
          <span className="text-muted mx-2">·</span>
          <Link href="/portal/employee/paystubs" className="text-decoration-none">
            Table &amp; preview
          </Link>
          <span className="text-muted mx-2">·</span>
          <Link href="/portal/employee/profile" className="text-decoration-none">
            Profile
          </Link>
          <span className="text-muted mx-2">·</span>
          <Link href="/portal/employee/statements" className="text-decoration-none">
            Bank statements
          </Link>
        </nav>
        <h1 className="h2 fw-bold section-title mb-2">My pay stubs</h1>
        <p className="section-subtitle mb-3">
          Stubs for employees where <code className="small">user_id</code> matches your account. API:{" "}
          <code className="small">GET {getApiOrigin()}/api/paystubs/</code>
        </p>

        <div className="row g-2 mb-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label small mb-1">Search</label>
            <input
              className="form-control form-control-sm"
              placeholder="Id or date substring…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1">Pay year</label>
            <select
              className="form-select form-select-sm"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1">From</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1">To</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          <div className="col-md-auto d-flex flex-wrap align-items-center gap-2">
            <span className="small text-secondary">
              Showing {filtered.length} of {rows.length}
            </span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={filtered.length === 0}
              onClick={exportFilteredCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
        <p className="small text-muted mb-3">
          Date range: rows match if <strong>pay date</strong> falls in range and/or the{" "}
          <strong>pay period</strong> overlaps the range.
        </p>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        <div className="table-responsive border rounded bg-white">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>ID</th>
                <th>Pay period</th>
                <th>Pay date</th>
                <th className="text-end">Gross</th>
                <th className="text-end">Net</th>
                <th className="text-end">Detail</th>
                <th className="text-end">Download</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-monospace small">{r.id}</td>
                  <td className="small">
                    {r.pay_period_start ?? "—"} → {r.pay_period_end ?? "—"}
                  </td>
                  <td className="small">{r.pay_date ?? "—"}</td>
                  <td className="text-end small">{r.gross_pay ?? "—"}</td>
                  <td className="text-end small">{r.net_pay ?? "—"}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled={detailBusy}
                      onClick={() => loadDetail(r.id)}
                    >
                      {detailId === r.id ? "Hide" : "View"}
                    </button>
                  </td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm">
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadStub(r.id, "html")}
                      >
                        HTML
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadStub(r.id, "pdf")}
                      >
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !err && (
          <p className="text-secondary mt-3 mb-0">No pay stubs yet.</p>
        )}
        {rows.length > 0 && filtered.length === 0 && (
          <p className="text-secondary mt-3 mb-0">No rows match filters.</p>
        )}

        {detailJson != null && detailId != null && (
          <div className="form-card mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h2 className="h6 fw-bold mb-0">Pay stub #{detailId}</h2>
              <div className="d-flex align-items-center gap-2">
                {jsonCopyMsg && (
                  <span
                    className={`small ${jsonCopyMsg === "Copied." ? "text-success" : "text-danger"}`}
                  >
                    {jsonCopyMsg}
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => void copyDetailJson()}
                >
                  Copy JSON
                </button>
              </div>
            </div>
            <p className="small text-secondary mb-2">
              Summary from <code className="small">data</code> when available; full JSON below.
            </p>
            <PayStubDataSummary data={dataForSummary} />
            <pre className="small bg-light p-3 rounded mb-0 overflow-auto" style={{ maxHeight: 360 }}>
              {detailJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
