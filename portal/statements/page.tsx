"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import BankStatementDataSummary from "@/components/BankStatementDataSummary";
import { periodOverlapsRange } from "@/lib/dateRange";
import { downloadRowsAsCsv } from "@/lib/csvExport";
import { apiFetchBlob, getApiOrigin, statementsApi } from "@/lib/api";

type StmtRow = {
  id: number;
  employee_id: number | null;
  statement_start: string | null;
  statement_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
};

export default function StatementsPortalPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<StmtRow[]>([]);
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
      const res = await statementsApi.getAll();
      setRows((res.statements as StmtRow[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load statements");
      setRows([]);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const years = useMemo(() => {
    const y = new Set<number>();
    for (const r of rows) {
      const d = r.statement_end || r.statement_start;
      if (d && d.length >= 4) {
        const n = parseInt(d.slice(0, 4), 10);
        if (!Number.isNaN(n)) y.add(n);
      }
    }
    return Array.from(y).sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filterYear) {
      out = out.filter(
        (r) =>
          (r.statement_end || "").startsWith(filterYear) ||
          (r.statement_start || "").startsWith(filterYear)
      );
    }
    if (filterDateFrom || filterDateTo) {
      out = out.filter((r) =>
        periodOverlapsRange(
          r.statement_start,
          r.statement_end,
          filterDateFrom,
          filterDateTo
        )
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          String(r.id).includes(q) ||
          String(r.employee_id ?? "").includes(q) ||
          (r.statement_start || "").toLowerCase().includes(q) ||
          (r.statement_end || "").toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) =>
      (b.statement_end || b.statement_start || "").localeCompare(
        a.statement_end || a.statement_start || ""
      )
    );
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
      const data = (await statementsApi.getOne(id)) as Record<string, unknown>;
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
      "statement_start",
      "statement_end",
      "opening_balance",
      "closing_balance",
    ];
    const data = filtered.map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      statement_start: r.statement_start,
      statement_end: r.statement_end,
      opening_balance: r.opening_balance,
      closing_balance: r.closing_balance,
    })) as Record<string, unknown>[];
    downloadRowsAsCsv(headers, data, "bank-statements");
  }

  async function downloadStmt(id: number, fmt: "pdf" | "html") {
    setDlBusy(id);
    try {
      const blob = await apiFetchBlob(`/statements/${id}/download/${fmt}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement-${id}.${fmt === "pdf" ? "pdf" : "html"}`;
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
            <h1 className="h3 fw-bold mb-2">Statements</h1>
            <p className="text-secondary mb-3">Sign in to see bank statements for your linked employees.</p>
            <Link href="/login" className="btn btn-pr-primary">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-10">
        <nav className="mb-3 small">
          <Link href="/portal/employee" className="text-decoration-none">
            Pay stubs
          </Link>
          <span className="text-muted mx-2">·</span>
          <span className="fw-semibold text-primary">Bank statements</span>
        </nav>
        <h1 className="h2 fw-bold section-title mb-2">My bank statements</h1>
        <p className="section-subtitle mb-3">
          <code className="small">GET {getApiOrigin()}/api/statements/</code> ·{" "}
          <Link href="/statement">Generate new</Link>
        </p>

        <div className="row g-2 mb-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label small mb-1">Search</label>
            <input
              className="form-control form-control-sm"
              placeholder="Id, employee id, dates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small mb-1">Statement year</label>
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
          Date range: statement period must overlap the selected range (inclusive).
        </p>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        <div className="table-responsive border rounded bg-white">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>ID</th>
                <th>Period</th>
                <th className="text-end">Opening</th>
                <th className="text-end">Closing</th>
                <th className="text-end">Detail</th>
                <th className="text-end">Download</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-monospace small">{r.id}</td>
                  <td className="small">
                    {r.statement_start ?? "—"} → {r.statement_end ?? "—"}
                  </td>
                  <td className="text-end small">{r.opening_balance ?? "—"}</td>
                  <td className="text-end small">{r.closing_balance ?? "—"}</td>
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
                        onClick={() => downloadStmt(r.id, "html")}
                      >
                        HTML
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadStmt(r.id, "pdf")}
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
          <p className="text-secondary mt-3 mb-0">No bank statements yet.</p>
        )}
        {rows.length > 0 && filtered.length === 0 && (
          <p className="text-secondary mt-3 mb-0">No rows match filters.</p>
        )}

        {detailJson != null && detailId != null && (
          <div className="form-card mt-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <h2 className="h6 fw-bold mb-0">Statement #{detailId}</h2>
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
            <p className="small text-secondary mb-2">Summary from stored <code className="small">data</code>.</p>
            <BankStatementDataSummary data={detailPayload?.data} />
            <pre className="small bg-light p-3 rounded mb-0 overflow-auto" style={{ maxHeight: 360 }}>
              {detailJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
