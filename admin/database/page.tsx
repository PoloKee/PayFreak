"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  adminApi,
  employersApi,
  type ApiEmployer,
  type DatabaseOverview,
} from "@/lib/api";

const PAGE_SIZE = 40;

export default function AdminDatabasePage() {
  const { user, loading, isAdmin } = useAuth();
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [employers, setEmployers] = useState<ApiEmployer[]>([]);
  const [defaultEmployerId, setDefaultEmployerId] = useState<string>("");
  const [defaultBusy, setDefaultBusy] = useState(false);
  const [defaultMsg, setDefaultMsg] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowTotal, setRowTotal] = useState(0);
  const [rowsBusy, setRowsBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dbPing, setDbPing] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setErr(null);
    const o = await adminApi.databaseOverview();
    setOverview(o);
    setSelectedTable((prev) => prev || o.tables[0]?.name || "");
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        await loadOverview();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load overview");
        }
      }
      try {
        const h = await adminApi.healthDb();
        if (!cancelled) setDbPing(h.database);
      } catch {
        if (!cancelled) setDbPing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, loadOverview]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const [em, def] = await Promise.all([
          employersApi.getAll(),
          employersApi.getDefault(),
        ]);
        if (cancelled) return;
        setEmployers(em.employers);
        setDefaultEmployerId(
          def.employer ? String(def.employer.id) : ""
        );
      } catch {
        if (!cancelled) setEmployers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user || !isAdmin || !selectedTable) return;
    let cancelled = false;
    (async () => {
      setRowsBusy(true);
      try {
        const p = await adminApi.databaseTableRows(
          selectedTable,
          PAGE_SIZE,
          offset
        );
        if (cancelled) return;
        setRows(p.rows);
        setRowTotal(p.total);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setRowTotal(0);
          setErr(e instanceof Error ? e.message : "Table load failed");
        }
      } finally {
        if (!cancelled) setRowsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, selectedTable, offset]);

  const columns = useMemo(() => {
    const t = overview?.tables.find((x) => x.name === selectedTable);
    return t?.columns ?? [];
  }, [overview, selectedTable]);

  const rowKeys = useMemo(() => {
    if (rows.length === 0) return [] as string[];
    const keys = new Set<string>();
    for (const r of rows) {
      Object.keys(r).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort();
  }, [rows]);

  const saveDefaultEmployer = async () => {
    setDefaultBusy(true);
    setDefaultMsg(null);
    try {
      await adminApi.putSetting("default_employer_id", {
        value: defaultEmployerId.trim() || null,
        description: "Default employer for forms and workflows",
      });
      setDefaultMsg("Saved. Add Employee and admin create-employee will preselect this company when empty.");
    } catch (e) {
      setDefaultMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDefaultBusy(false);
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
            <h1 className="h3 fw-bold mb-2">Database</h1>
            <p className="text-secondary mb-3">Administrator sign-in required.</p>
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
      <div className="col-12 col-xl-11">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-1">Database</h1>
            <p className="section-subtitle mb-0 small">
              Live overview of PayRight tables, row counts, column types, and paginated previews. Password hashes are
              redacted.
            </p>
          </div>
          <Link href="/admin" className="btn btn-outline-secondary btn-sm">
            ← Admin home
          </Link>
        </div>

        {err && (
          <div className="alert alert-warning py-2 small mb-3">
            {err}
            <button
              type="button"
              className="btn btn-sm btn-outline-dark ms-2"
              onClick={() => {
                setErr(null);
                loadOverview().catch(() => {});
              }}
            >
              Retry overview
            </button>
          </div>
        )}

        <div className="row g-3 mb-4">
          <div className="col-md-6 col-lg-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Connection</h2>
              <p className="small text-secondary mb-2">
                Engine scheme from server config (no credentials shown).
              </p>
              <p className="mb-1">
                <strong>{overview?.database_scheme ?? "—"}</strong>
              </p>
              {dbPing && (
                <p className="small text-success mb-0">
                  Health check: <code className="small">/api/admin/health/db</code> → {dbPing}
                </p>
              )}
            </div>
          </div>
          <div className="col-md-6 col-lg-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Capabilities</h2>
              <ul className="small text-secondary mb-0 ps-3">
                <li>ORM-backed tables only (whitelist); no raw SQL.</li>
                <li>Users: <code className="small">password_hash</code> masked.</li>
                <li>Settings: use System settings for ops keys.</li>
                <li>Backups: see Admin → Settings / backup POST guidance.</li>
              </ul>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-2">Default company</h2>
              <p className="small text-secondary mb-2">
                Stored in <code className="small">system_settings.default_employer_id</code>. Pre-fills employer on Add
                Employee when you have not chosen one yet.
              </p>
              <select
                className="form-select form-select-sm mb-2"
                value={defaultEmployerId}
                onChange={(e) => setDefaultEmployerId(e.target.value)}
                aria-label="Default employer"
              >
                <option value="">None</option>
                {employers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.company_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-pr-primary btn-sm"
                disabled={defaultBusy}
                onClick={() => saveDefaultEmployer()}
              >
                {defaultBusy ? "Saving…" : "Save default"}
              </button>
              {defaultMsg && <p className="small mt-2 mb-0">{defaultMsg}</p>}
            </div>
          </div>
        </div>

        {overview?.stats && (
          <div className="form-card mb-4">
            <h2 className="h6 fw-bold mb-3">Quick counts</h2>
            <div className="row g-2 small">
              {Object.entries(overview.stats).map(([k, v]) => (
                <div key={k} className="col-6 col-md-4 col-lg-2">
                  <div className="border rounded p-2 text-center bg-white bg-opacity-50">
                    <div className="fw-bold text-primary">{v}</div>
                    <div className="text-secondary text-capitalize">{k.replace(/_/g, " ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-3">Tables</h2>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Table</th>
                  <th className="text-end">Rows</th>
                  <th>Columns</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(overview?.tables ?? []).map((t) => (
                  <tr key={t.name}>
                    <td>
                      <code className="small">{t.name}</code>
                    </td>
                    <td className="text-end">{t.count}</td>
                    <td className="small text-secondary">
                      {t.columns.length} fields
                    </td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => {
                          setSelectedTable(t.name);
                          setOffset(0);
                          setErr(null);
                        }}
                      >
                        Browse
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="form-card">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <h2 className="h6 fw-bold mb-0">Row preview</h2>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <label className="small text-secondary mb-0">Table</label>
              <select
                className="form-select form-select-sm"
                style={{ width: "auto", minWidth: "12rem" }}
                value={selectedTable}
                onChange={(e) => {
                  setSelectedTable(e.target.value);
                  setOffset(0);
                }}
              >
                {(overview?.tables ?? []).map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {columns.length > 0 && (
            <p className="small text-secondary mb-2">
              Schema:{" "}
              {columns.slice(0, 8).map((c) => (
                <span key={c.name} className="me-2">
                  <code className="small">{c.name}</code>{" "}
                  <span className="text-muted">({c.type})</span>
                </span>
              ))}
              {columns.length > 8 && <span>… +{columns.length - 8} more</span>}
            </p>
          )}

          <p className="small text-secondary mb-2">
            Showing {rows.length} of {rowTotal} rows (offset {offset}, limit {PAGE_SIZE}).
            {rowsBusy && " Loading…"}
          </p>

          <div className="d-flex gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={offset === 0 || rowsBusy}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={offset + PAGE_SIZE >= rowTotal || rowsBusy}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </button>
          </div>

          {rowKeys.length === 0 && !rowsBusy ? (
            <p className="text-secondary small mb-0">No rows or select a table.</p>
          ) : (
            <div className="table-responsive" style={{ maxHeight: 480 }}>
              <table className="table table-sm table-bordered align-top mb-0">
                <thead className="sticky-top bg-white">
                  <tr>
                    {rowKeys.map((k) => (
                      <th key={k} className="small text-nowrap">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {rowKeys.map((k) => (
                        <td key={k} className="small text-break" style={{ maxWidth: 280 }}>
                          {formatCell(r[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
