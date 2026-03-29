"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchBlob, apiFetchText, paystubsApi } from "@/lib/api";

type StubRow = {
  id: number;
  employee_id: number;
  pay_period_start: string | null;
  pay_period_end: string | null;
  pay_date: string | null;
  gross_pay: number | null;
  net_pay: number | null;
};

export default function EmployeePayStubsPage() {
  const { user, loading, isEmployee } = useAuth();
  const [rows, setRows] = useState<StubRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dlBusy, setDlBusy] = useState<number | null>(null);
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [htmlBody, setHtmlBody] = useState("");
  const [htmlTitle, setHtmlTitle] = useState("");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
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
  }, [rows, search]);

  async function downloadFmt(id: number, fmt: "pdf" | "html" | "json") {
    setDlBusy(id);
    setErr(null);
    try {
      const blob = await apiFetchBlob(`/paystubs/${id}/download/${fmt}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paystub_${id}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDlBusy(null);
    }
  }

  async function openHtmlPreview(id: number) {
    setErr(null);
    try {
      const text = await apiFetchText(`/paystubs/${id}/download/html`);
      setHtmlBody(text);
      setHtmlTitle(`Pay stub #${id}`);
      setHtmlOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load HTML");
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
            <h1 className="h3 fw-bold mb-2">My pay stubs</h1>
            <p className="text-secondary mb-3">Sign in with an employee account to view stubs.</p>
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
      <div className="col-lg-11">
        <nav className="mb-3 small">
          <Link href="/portal/employee" className="text-decoration-none">
            Employee portal
          </Link>
          <span className="text-muted mx-2">·</span>
          <span className="fw-semibold text-primary">All pay stubs</span>
          <span className="text-muted mx-2">·</span>
          <Link href="/portal/employee/statements" className="text-decoration-none">
            Bank statements
          </Link>
        </nav>

        <h1 className="h2 fw-bold section-title mb-2">My pay stubs</h1>
        <p className="section-subtitle mb-4">View, preview, and download PDF, HTML, or JSON.</p>

        <div className="row g-2 mb-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label small mb-1">Search by date or id</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. 2025 or period start…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-auto">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => load()}>
              Refresh
            </button>
          </div>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}

        <div className="table-responsive border rounded bg-white">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Pay period</th>
                <th>Pay date</th>
                <th className="text-end">Gross</th>
                <th className="text-end">Net</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="small">
                    {r.pay_period_start ?? "—"} — {r.pay_period_end ?? "—"}
                  </td>
                  <td className="small">{r.pay_date ?? "—"}</td>
                  <td className="text-end small">
                    {r.gross_pay != null ? `$${Number(r.gross_pay).toLocaleString()}` : "—"}
                  </td>
                  <td className="text-end small text-success fw-semibold">
                    {r.net_pay != null ? `$${Number(r.net_pay).toLocaleString()}` : "—"}
                  </td>
                  <td>
                    <span className="badge text-bg-success">Generated</span>
                  </td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm flex-wrap justify-content-end">
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadFmt(r.id, "pdf")}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => openHtmlPreview(r.id)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-info"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadFmt(r.id, "json")}
                      >
                        JSON
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && !err && (
          <p className="text-secondary small mt-3 mb-0">No pay stubs match your filters.</p>
        )}

        {htmlOpen && (
          <div
            className="modal fade show d-block"
            tabIndex={-1}
            style={{ background: "rgba(0,0,0,0.45)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="paystub-preview-title"
          >
            <div className="modal-dialog modal-xl modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5" id="paystub-preview-title">
                    {htmlTitle}
                  </h2>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setHtmlOpen(false)}
                  />
                </div>
                <div className="modal-body p-0 bg-light">
                  <iframe
                    title="Pay stub HTML preview"
                    srcDoc={htmlBody}
                    className="w-100 border-0"
                    style={{ minHeight: "70vh" }}
                  />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setHtmlOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
