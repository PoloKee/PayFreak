"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchBlob, apiFetchText, statementsApi } from "@/lib/api";

/** Employee bank statements list (COMPLETE-THE-SYSTEM BankStatements.jsx), API field names. */
type StmtRow = {
  id: number;
  employee_id: number | null;
  account_number: string | null;
  statement_start: string | null;
  statement_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
};

export default function EmployeeBankStatementsPage() {
  const { user, loading, isEmployee } = useAuth();
  const [rows, setRows] = useState<StmtRow[]>([]);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter(
        (r) =>
          String(r.id).includes(q) ||
          (r.account_number || "").toLowerCase().includes(q) ||
          (r.statement_start || "").toLowerCase().includes(q) ||
          (r.statement_end || "").toLowerCase().includes(q)
      );
    }
    return [...out].sort((a, b) =>
      (b.statement_end || b.statement_start || "").localeCompare(a.statement_end || a.statement_start || "")
    );
  }, [rows, search]);

  async function downloadFmt(id: number, fmt: "pdf" | "html") {
    setDlBusy(id);
    setErr(null);
    try {
      const blob = await apiFetchBlob(`/statements/${id}/download/${fmt}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement_${id}.${fmt}`;
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
      const text = await apiFetchText(`/statements/${id}/download/html`);
      setHtmlBody(text);
      setHtmlTitle(`Statement #${id}`);
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
            <h1 className="h3 fw-bold mb-2">Bank statements</h1>
            <p className="text-secondary mb-3">Sign in with an employee account.</p>
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
          <Link href="/portal/employee/paystubs" className="text-decoration-none">
            Pay stubs
          </Link>
          <span className="text-muted mx-2">·</span>
          <span className="fw-semibold text-primary">Bank statements</span>
        </nav>

        <h1 className="h2 fw-bold section-title mb-2">Bank statements</h1>
        <p className="section-subtitle mb-4">View and download PDF or HTML. Full filters also on the shared portal page.</p>

        <div className="row g-2 mb-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label small mb-1">Search by period or account</label>
            <input
              className="form-control form-control-sm"
              placeholder="Period or account substring…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-auto">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => load()}>
              Refresh
            </button>
          </div>
          <div className="col-md-auto">
            <Link href="/portal/statements" className="btn btn-outline-primary btn-sm">
              Advanced portal
            </Link>
          </div>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}

        <div className="table-responsive border rounded bg-white">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Statement period</th>
                <th>Account</th>
                <th className="text-end">Opening</th>
                <th className="text-end">Closing</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="small">
                    {r.statement_start ?? "—"} — {r.statement_end ?? "—"}
                  </td>
                  <td className="small">
                    <code>{r.account_number || "—"}</code>
                  </td>
                  <td className="text-end small">
                    {r.opening_balance != null ? `$${Number(r.opening_balance).toLocaleString()}` : "—"}
                  </td>
                  <td className="text-end small text-success fw-semibold">
                    {r.closing_balance != null ? `$${Number(r.closing_balance).toLocaleString()}` : "—"}
                  </td>
                  <td className="text-end">
                    <div className="btn-group btn-group-sm">
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadFmt(r.id, "pdf")}
                      >
                        PDF
                      </button>
                      <button type="button" className="btn btn-outline-secondary" onClick={() => openHtmlPreview(r.id)}>
                        View
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        disabled={dlBusy === r.id}
                        onClick={() => downloadFmt(r.id, "html")}
                      >
                        HTML
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && !err && (
          <p className="text-secondary small mt-3 mb-0">No bank statements yet.</p>
        )}

        {htmlOpen && (
          <div
            className="modal fade show d-block"
            tabIndex={-1}
            style={{ background: "rgba(0,0,0,0.45)" }}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-dialog modal-xl modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5">{htmlTitle}</h2>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={() => setHtmlOpen(false)}
                  />
                </div>
                <div className="modal-body p-0 bg-light">
                  <iframe
                    title="Statement HTML preview"
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
