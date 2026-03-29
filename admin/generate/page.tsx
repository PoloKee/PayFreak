"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  ApiTemplate,
  employeesApi,
  paystubsApi,
  templatesApi,
} from "@/lib/api";

type EmpRow = {
  id: number;
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  pay_rate: number | null;
};

export default function AdminBatchGeneratePage() {
  const { user, loading, isAdmin, isEmployer } = useAuth();
  const canUse = Boolean(user && (isAdmin || isEmployer));

  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [templateSlug, setTemplateSlug] = useState("");
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState("");
  const [grossPay, setGrossPay] = useState("");
  const [regularHours, setRegularHours] = useState("");
  const [regularRate, setRegularRate] = useState("");
  const [federalTax, setFederalTax] = useState("");
  const [stateTax, setStateTax] = useState("");
  const [socialSecurity, setSocialSecurity] = useState("");
  const [medicare, setMedicare] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ ok: number; fail: number; last?: string } | null>(
    null
  );

  const load = useCallback(async () => {
    if (!canUse) return;
    setErr(null);
    try {
      const [er, tr] = await Promise.all([employeesApi.getAll(), templatesApi.list()]);
      setEmployees((er.employees as EmpRow[]) ?? []);
      const list = tr.templates ?? [];
      setTemplates(list);
      const pay = list.filter((t) => t.type === "pay_stub" && t.is_active !== false);
      setTemplateSlug((prev) => prev || pay[0]?.slug || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load data");
    }
  }, [canUse]);

  useEffect(() => {
    load();
  }, [load]);

  const payTemplates = useMemo(
    () => templates.filter((t) => t.type === "pay_stub" && t.is_active !== false),
    [templates]
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === employees.length) setSelected(new Set());
    else setSelected(new Set(employees.map((e) => e.id)));
  };

  const runGenerate = async () => {
    setErr(null);
    setMsg(null);
    if (selected.size === 0) {
      setErr("Select at least one employee.");
      return;
    }
    if (!templateSlug.trim()) {
      setErr("Choose a template.");
      return;
    }
    if (!payPeriodStart || !payPeriodEnd || !payDate) {
      setErr("Pay period start, end, and pay date are required.");
      return;
    }
    const gross = parseFloat(grossPay) || 0;
    const rh = parseFloat(regularHours) || 0;
    const rr = parseFloat(regularRate) || 0;
    const ft = parseFloat(federalTax) || 0;
    const st = parseFloat(stateTax) || 0;
    const ss = parseFloat(socialSecurity) || 0;
    const med = parseFloat(medicare) || 0;

    const pay_data = {
      gross_pay: gross,
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      pay_date: payDate,
      earnings: {
        regular_hours: rh,
        regular_rate: rr,
        regular_amount: rh * rr,
      },
      deductions: {
        federal_tax: ft,
        state_tax: st,
        social_security: ss,
        medicare: med,
      },
    };

    setBusy(true);
    let ok = 0;
    let fail = 0;
    const ids = Array.from(selected);
    for (const employee_id of ids) {
      try {
        await paystubsApi.generate({
          employee_id,
          template_slug: templateSlug.trim(),
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          pay_date: payDate,
          gross_pay: gross,
          federal_tax: ft || undefined,
          state_tax: st || undefined,
          other_deductions: ss + med || undefined,
          pay_data,
        });
        ok += 1;
        setProgress({ ok, fail, last: `Employee #${employee_id} OK` });
      } catch (e) {
        fail += 1;
        const m = e instanceof Error ? e.message : "error";
        setProgress({ ok, fail, last: `Employee #${employee_id}: ${m}` });
      }
    }
    setBusy(false);
    setMsg(`Finished: ${ok} generated, ${fail} failed.`);
  };

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  if (!user || !canUse) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Batch pay stubs</h1>
            <p className="text-secondary mb-3">Admin or employer sign-in required.</p>
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
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h1 className="h2 fw-bold section-title mb-0">Batch pay stub generation</h1>
            <p className="small text-secondary mb-0">
              Uses <code className="small">POST /api/paystubs/generate</code> per employee (immediate PDF/HTML/JSON).
            </p>
          </div>
          <Link href={isAdmin ? "/admin" : "/"} className="btn btn-outline-secondary btn-sm">
            {isAdmin ? "Admin home" : "Home"}
          </Link>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
        {msg && <div className="alert alert-success py-2 small mb-3">{msg}</div>}
        {progress && (
          <p className="small text-muted mb-3">
            Progress: {progress.ok} ok, {progress.fail} failed
            {progress.last ? ` — ${progress.last}` : ""}
          </p>
        )}

        <div className="row g-4">
          <div className="col-lg-4">
            <div className="form-card h-100">
              <h2 className="h6 fw-bold mb-3">Document settings</h2>
              <div className="mb-3">
                <label className="form-label small">Template (slug)</label>
                <select
                  className="form-select form-select-sm"
                  value={templateSlug}
                  onChange={(e) => setTemplateSlug(e.target.value)}
                >
                  {payTemplates.map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label small">Pay period start</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={payPeriodStart}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <label className="form-label small">Pay period end</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <label className="form-label small">Pay date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <hr />
              <div className="mb-2">
                <label className="form-label small">Regular hours</label>
                <input
                  type="number"
                  step="0.5"
                  className="form-control form-control-sm"
                  value={regularHours}
                  onChange={(e) => setRegularHours(e.target.value)}
                />
              </div>
              <div className="mb-2">
                <label className="form-label small">Regular rate ($/hr)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={regularRate}
                  onChange={(e) => setRegularRate(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <label className="form-label small">Gross pay</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={grossPay}
                  onChange={(e) => setGrossPay(e.target.value)}
                />
              </div>
              <hr />
              <div className="mb-2">
                <label className="form-label small">Federal tax</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={federalTax}
                  onChange={(e) => setFederalTax(e.target.value)}
                />
              </div>
              <div className="mb-2">
                <label className="form-label small">State tax</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={stateTax}
                  onChange={(e) => setStateTax(e.target.value)}
                />
              </div>
              <div className="mb-2">
                <label className="form-label small">Social Security</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={socialSecurity}
                  onChange={(e) => setSocialSecurity(e.target.value)}
                />
              </div>
              <div className="mb-0">
                <label className="form-label small">Medicare</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={medicare}
                  onChange={(e) => setMedicare(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="col-lg-8">
            <div className="form-card">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h6 fw-bold mb-0">Select employees</h2>
                <button type="button" className="btn btn-link btn-sm p-0" onClick={selectAll}>
                  {selected.size === employees.length && employees.length > 0 ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="table-responsive border rounded" style={{ maxHeight: 420 }}>
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={
                            employees.length > 0 && selected.size === employees.length
                          }
                          onChange={selectAll}
                          title="Select all"
                        />
                      </th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th className="text-end">Pay rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id}>
                        <td>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={selected.has(emp.id)}
                            onChange={() => toggle(emp.id)}
                          />
                        </td>
                        <td className="small font-monospace">{emp.employee_id}</td>
                        <td className="small">
                          {[emp.first_name, emp.last_name].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="small">{emp.email ?? "—"}</td>
                        <td className="text-end small">
                          {emp.pay_rate != null ? `$${Number(emp.pay_rate).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {employees.length === 0 && (
                <p className="small text-secondary mt-2 mb-0">No employees in the database.</p>
              )}
              <button
                type="button"
                className="btn btn-pr-primary w-100 mt-4"
                disabled={busy || selected.size === 0}
                onClick={runGenerate}
              >
                {busy ? "Generating…" : `Generate for ${selected.size} employee(s)`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
