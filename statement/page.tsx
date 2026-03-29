"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { employeesApi, statementsApi } from "@/lib/api";

type ApiEmp = {
  id: number;
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
};

type GenResult = {
  statement?: {
    id: number;
    opening_balance: number | null;
    closing_balance: number | null;
    statement_start: string | null;
    statement_end: string | null;
  };
};

export default function GenerateStatementPage() {
  const { user, loading } = useAuth();
  const useApi = Boolean(user);

  const [employees, setEmployees] = useState<ApiEmp[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [templateSlug, setTemplateSlug] = useState("bank-statement-standard");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("0");
  const [bankName, setBankName] = useState("Bank");
  const [accountNumber, setAccountNumber] = useState("****1234");
  const [holder, setHolder] = useState("");
  const [transactionsJson, setTransactionsJson] = useState("[]");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult["statement"] | null>(null);

  useEffect(() => {
    if (!useApi) return;
    let c = false;
    (async () => {
      try {
        const res = await employeesApi.getAll();
        if (!c) setEmployees((res.employees as ApiEmp[]) ?? []);
      } catch {
        if (!c) setEmployees([]);
      }
    })();
    return () => {
      c = true;
    };
  }, [useApi]);

  const label = (e: ApiEmp) => {
    const n = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
    return `${n || e.employee_id} (${e.employee_id})`;
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setMessage("");
    if (!useApi) {
      setError("Sign in to generate statements via the API.");
      return;
    }
    let transactions: unknown[] = [];
    try {
      const parsed = JSON.parse(transactionsJson || "[]");
      if (!Array.isArray(parsed)) throw new Error("transactions must be a JSON array");
      transactions = parsed;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid transactions JSON");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        template_slug: templateSlug,
        period_start: periodStart,
        period_end: periodEnd,
        opening_balance: parseFloat(opening) || 0,
        closing_balance: parseFloat(closing) || 0,
        bank_name: bankName,
        account_number: accountNumber,
        transactions,
      };
      if (holder.trim()) body.holder = holder.trim();
      if (employeeId) body.employee_id = Number(employeeId);
      const res = (await statementsApi.generate(body)) as GenResult;
      if (res.statement) {
        setResult(res.statement);
        setMessage("Statement generated.");
      } else {
        setError("Unexpected API response.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-xl-8">
        <div className="form-card">
          <h1 className="h2 fw-bold section-title mb-2">Generate bank statement</h1>
          <p className="section-subtitle mb-4">
            {useApi ? (
              <span className="text-success">
                <code className="small">POST /api/statements/generate</code> — run{" "}
                <code className="small">flask init-templates</code> for{" "}
                <code className="small">bank-statement-standard</code>.
              </span>
            ) : (
              <span>
                <Link href="/login">Sign in</Link> to use the API.
              </span>
            )}
          </p>
          {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

          <form onSubmit={onSubmit}>
            <div className="row g-3">
              <div className="col-12">
                <label className="field-label">Employee (optional)</label>
                <select
                  className="form-select"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  disabled={!useApi}
                >
                  <option value="">— none —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={String(emp.id)}>
                      {label(emp)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12">
                <label className="field-label">Account holder override</label>
                <input
                  className="form-control"
                  placeholder="Leave blank to use employee name"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="field-label">Template slug</label>
                <input
                  className="form-control"
                  value={templateSlug}
                  onChange={(e) => setTemplateSlug(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label">Period start</label>
                <input
                  className="form-control"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="field-label">Period end</label>
                <input
                  className="form-control"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="field-label">Opening balance</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label">Closing balance</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label">Bank name</label>
                <input
                  className="form-control"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label">Account number (display)</label>
                <input
                  className="form-control"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
              <div className="col-12">
                <label className="field-label">Transactions (JSON array)</label>
                <textarea
                  className="form-control font-monospace small"
                  rows={5}
                  value={transactionsJson}
                  onChange={(e) => setTransactionsJson(e.target.value)}
                  placeholder='[{"date":"2025-01-05","description":"Deposit","amount":100,"balance":100}]'
                />
              </div>
            </div>
            <div className="mt-4 d-flex flex-wrap gap-2 align-items-center">
              <button type="submit" className="btn btn-pr-primary" disabled={busy || !useApi}>
                {busy ? "Generating…" : "Generate"}
              </button>
              {useApi && (
                <Link href="/portal/statements" className="btn btn-outline-secondary btn-sm">
                  My statements
                </Link>
              )}
              {message && <span className="status-success small">{message}</span>}
            </div>
          </form>

          {result && (
            <div className="mt-4 p-3 rounded border bg-light small">
              <strong>Statement #{result.id}</strong> · {result.statement_start} —{" "}
              {result.statement_end} · opening {result.opening_balance} · closing{" "}
              {result.closing_balance}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
