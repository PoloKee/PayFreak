"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { adminApi, type SystemSettingRow } from "@/lib/api";

/** Keys aligned with COMPLETE-THE-SYSTEM.MD SystemSettings.jsx (stored as `system_settings` rows). */
const CORE_KEYS = [
  "company_name",
  "company_tax_id",
  "company_address",
  "tax_federal_rate",
  "tax_state_rate",
  "social_security_rate",
  "medicare_rate",
  "default_pay_frequency",
  "document_retention_days",
] as const;

type CoreKey = (typeof CORE_KEYS)[number];

const CORE_DEFAULTS: Record<CoreKey, string> = {
  company_name: "",
  company_tax_id: "",
  company_address: "",
  tax_federal_rate: "15",
  tax_state_rate: "5",
  social_security_rate: "6.2",
  medicare_rate: "1.45",
  default_pay_frequency: "biweekly",
  document_retention_days: "2555",
};

const CORE_SET = new Set<string>(CORE_KEYS);

function coreFromRows(rows: SystemSettingRow[]): Record<CoreKey, string> {
  const fromDb: Record<string, string> = {};
  for (const r of rows) {
    fromDb[r.setting_key] = r.setting_value ?? "";
  }
  const out = { ...CORE_DEFAULTS };
  for (const k of CORE_KEYS) {
    if (fromDb[k] !== undefined && fromDb[k] !== "") {
      out[k] = fromDb[k];
    }
  }
  return out;
}

export default function AdminSystemSettingsPage() {
  const { user, loading, isAdmin } = useAuth();
  const [rows, setRows] = useState<SystemSettingRow[]>([]);
  const [core, setCore] = useState<Record<CoreKey, string>>(CORE_DEFAULTS);
  const [extraDraft, setExtraDraft] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupJson, setBackupJson] = useState<string | null>(null);
  const [dbLabel, setDbLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !isAdmin) return;
    setErr(null);
    try {
      const [res, health] = await Promise.all([
        adminApi.listSettings(),
        adminApi.healthDb().catch(() => null),
      ]);
      const list = res.settings ?? [];
      setRows(list);
      setCore(coreFromRows(list));
      const xd: Record<string, string> = {};
      for (const r of list) {
        if (!CORE_SET.has(r.setting_key)) {
          xd[r.setting_key] = r.setting_value ?? "";
        }
      }
      setExtraDraft(xd);
      setDbLabel(health?.database ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, [user, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const extraRows = useMemo(
    () => rows.filter((r) => !CORE_SET.has(r.setting_key)),
    [rows]
  );

  const saveCore = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      for (const k of CORE_KEYS) {
        await adminApi.putSetting(k, {
          value: core[k] || "",
          setting_type: k.startsWith("tax_") || k.includes("rate") || k === "document_retention_days" ? "number" : "string",
        });
      }
      setMsg("Company, tax, and preference settings saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const saveExtraKey = async (key: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await adminApi.putSetting(key, { value: extraDraft[key] ?? "" });
      setMsg(`Saved “${key}”.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const addNew = async () => {
    const key = newKey.trim();
    if (!key) {
      setErr("Setting key is required.");
      return;
    }
    if (CORE_SET.has(key)) {
      setErr(`“${key}” is edited in the main form above.`);
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await adminApi.putSetting(key, { value: newValue, setting_type: "string" });
      setNewKey("");
      setNewValue("");
      setMsg(`Created “${key}”.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const showBackup = async () => {
    setErr(null);
    try {
      const info = await adminApi.backupInfo();
      setBackupJson(JSON.stringify(info, null, 2));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Backup info failed");
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
            <h1 className="h3 fw-bold mb-2">System settings</h1>
            <p className="text-secondary mb-3">Administrator only.</p>
            <Link href="/admin" className="btn btn-outline-secondary btn-sm">
              Admin home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-11">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-0">System settings</h1>
            <p className="small text-secondary mb-0">
              Structured keys map to <code className="small">PUT /api/admin/settings/&lt;key&gt;</code>.
            </p>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => load()}>
              Refresh
            </button>
            <button type="button" className="btn btn-pr-primary btn-sm" disabled={busy} onClick={saveCore}>
              {busy ? "Saving…" : "Save application settings"}
            </button>
            <Link href="/admin" className="btn btn-outline-primary btn-sm">
              Admin home
            </Link>
          </div>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        {msg && <div className="alert alert-success py-2 small mb-3">{msg}</div>}

        <div className="row g-4">
          <div className="col-lg-8">
            <div className="form-card mb-4">
              <h2 className="h6 fw-bold mb-3">Company information</h2>
              <div className="mb-3">
                <label className="form-label small">Company name</label>
                <input
                  className="form-control form-control-sm"
                  value={core.company_name}
                  onChange={(e) => setCore((c) => ({ ...c, company_name: e.target.value }))}
                />
              </div>
              <div className="mb-3">
                <label className="form-label small">Company tax ID / EIN</label>
                <input
                  className="form-control form-control-sm"
                  value={core.company_tax_id}
                  onChange={(e) => setCore((c) => ({ ...c, company_tax_id: e.target.value }))}
                />
              </div>
              <div className="mb-0">
                <label className="form-label small">Company address</label>
                <input
                  className="form-control form-control-sm"
                  value={core.company_address}
                  onChange={(e) => setCore((c) => ({ ...c, company_address: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-card mb-4">
              <h2 className="h6 fw-bold mb-3">Tax settings (%)</h2>
              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label small">Federal tax rate</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control form-control-sm"
                    value={core.tax_federal_rate}
                    onChange={(e) => setCore((c) => ({ ...c, tax_federal_rate: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">State tax rate</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control form-control-sm"
                    value={core.tax_state_rate}
                    onChange={(e) => setCore((c) => ({ ...c, tax_state_rate: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Social Security rate</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control form-control-sm"
                    value={core.social_security_rate}
                    onChange={(e) => setCore((c) => ({ ...c, social_security_rate: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Medicare rate</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-control form-control-sm"
                    value={core.medicare_rate}
                    onChange={(e) => setCore((c) => ({ ...c, medicare_rate: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="form-card mb-4">
              <h2 className="h6 fw-bold mb-3">System preferences</h2>
              <div className="mb-3">
                <label className="form-label small">Default pay frequency</label>
                <select
                  className="form-select form-select-sm"
                  value={core.default_pay_frequency}
                  onChange={(e) => setCore((c) => ({ ...c, default_pay_frequency: e.target.value }))}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="semi-monthly">Semi-monthly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="mb-0">
                <label className="form-label small">Document retention (days)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={core.document_retention_days}
                  onChange={(e) => setCore((c) => ({ ...c, document_retention_days: e.target.value }))}
                />
                <p className="form-text small mb-0">Default 2555 ≈ 7 years (policy is enforced elsewhere).</p>
              </div>
            </div>

            <div className="form-card mb-4">
              <h2 className="h6 fw-bold mb-3">Additional keys</h2>
              <p className="small text-secondary mb-2">
                Extra rows in <code className="small">system_settings</code> not listed above.
              </p>
              <div className="row g-2 align-items-end mb-3">
                <div className="col-md-4">
                  <label className="form-label small">New key</label>
                  <input
                    className="form-control form-control-sm"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="custom_flag"
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label small">Value</label>
                  <input
                    className="form-control form-control-sm"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <button type="button" className="btn btn-outline-primary btn-sm w-100" disabled={busy} onClick={addNew}>
                    Add key
                  </button>
                </div>
              </div>
              {extraRows.length === 0 ? (
                <p className="small text-muted mb-0">No extra keys. Use <code className="small">flask seed-settings</code> or Add key.</p>
              ) : (
                <div className="table-responsive border rounded">
                  <table className="table table-sm mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                        <th className="text-end">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraRows.map((r) => (
                        <tr key={r.id}>
                          <td className="small font-monospace">{r.setting_key}</td>
                          <td>
                            <input
                              className="form-control form-control-sm"
                              value={extraDraft[r.setting_key] ?? ""}
                              onChange={(e) =>
                                setExtraDraft((d) => ({ ...d, [r.setting_key]: e.target.value }))
                              }
                            />
                          </td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              disabled={busy}
                              onClick={() => saveExtraKey(r.setting_key)}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="col-lg-4">
            <div className="form-card mb-4">
              <h2 className="h6 fw-bold mb-3">System actions</h2>
              <button type="button" className="btn btn-outline-primary btn-sm w-100 mb-2" onClick={showBackup}>
                Backup instructions (API)
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm w-100 mb-2" disabled title="Use DBA tooling">
                Restore from backup
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm w-100" disabled title="Not wired">
                System logs
              </button>
              {backupJson && (
                <pre className="small bg-light p-2 rounded mt-3 mb-0 overflow-auto" style={{ maxHeight: 220 }}>
                  {backupJson}
                </pre>
              )}
            </div>

            <div className="form-card">
              <h2 className="h6 fw-bold mb-3">System information</h2>
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr>
                    <td className="text-muted small">App version</td>
                    <td className="text-end small">0.1.0</td>
                  </tr>
                  <tr>
                    <td className="text-muted small">Database ping</td>
                    <td className="text-end small">{dbLabel ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="text-muted small">Environment</td>
                    <td className="text-end small">
                      {process.env.NODE_ENV === "production" ? "Production" : "Development"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
