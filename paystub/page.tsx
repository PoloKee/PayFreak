"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { employeesApi, paystubsApi } from "@/lib/api";
import { getEmployees, generatePayStub } from "./actions";
import type { Employee as LocalEmployee, PayStub as LocalPayStub } from "@/lib/schema";

type ApiEmployeeRow = {
  id: number;
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
};

type ApiPaystubSummary = {
  id: number;
  employee_id: number;
  gross_pay: number | null;
  net_pay: number | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  pay_date: string | null;
};

export default function GeneratePayStub() {
  const { user, loading } = useAuth();
  const useApi = Boolean(user);

  const [employeeId, setEmployeeId] = useState("");
  const [apiEmployees, setApiEmployees] = useState<ApiEmployeeRow[]>([]);
  const [localEmployees, setLocalEmployees] = useState<LocalEmployee[]>([]);
  const [payPeriodStart, setPayPeriodStart] = useState("");
  const [payPeriodEnd, setPayPeriodEnd] = useState("");
  const [grossPay, setGrossPay] = useState("");
  const [templateSlug, setTemplateSlug] = useState("pay-stub-standard");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiResult, setApiResult] = useState<ApiPaystubSummary | null>(null);
  const [localStub, setLocalStub] = useState<LocalPayStub | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (useApi) {
        try {
          const res = await employeesApi.getAll();
          const list = (res.employees as ApiEmployeeRow[]) ?? [];
          if (!cancelled) setApiEmployees(list);
        } catch {
          if (!cancelled) setApiEmployees([]);
        }
      } else {
        const employees = await getEmployees();
        if (!cancelled) setLocalEmployees(employees);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useApi]);

  const apiEmployeeLabel = (e: ApiEmployeeRow) => {
    const n = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
    return n || e.employee_id;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setApiResult(null);
    setLocalStub(null);
    setBusy(true);
    try {
      if (useApi) {
        const res = (await paystubsApi.generate({
          employee_id: Number(employeeId),
          gross_pay: parseFloat(grossPay),
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          pay_date: payPeriodEnd || payPeriodStart,
          template_slug: templateSlug,
        })) as { paystub?: ApiPaystubSummary };
        if (res.paystub) {
          setApiResult(res.paystub);
          setMessage("Pay stub generated via API.");
        } else {
          setMessage("");
          setError("Unexpected API response.");
        }
      } else {
        const result = await generatePayStub(
          employeeId,
          parseFloat(grossPay),
          payPeriodStart,
          payPeriodEnd
        );
        if (result.success && result.payStub) {
          setMessage("Pay stub generated (local demo).");
          setLocalStub(result.payStub);
        } else {
          setMessage("");
          setError("Failed to generate pay stub.");
        }
      }
    } catch (err) {
      setMessage("");
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="row justify-content-center py-5">
        <p className="text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="row justify-content-center g-4">
      <div className="col-xl-8">
        <div className="form-card">
          <h1 className="h2 fw-bold section-title mb-2">Generate Pay Stub</h1>
          <p className="section-subtitle mb-4">
            {useApi ? (
              <span className="text-success">
                Using Flask <code className="small">POST /api/paystubs/generate</code>.
              </span>
            ) : (
              <span>
                Local demo calculator.{" "}
                <Link href="/login">Sign in</Link> to generate stubs in the database (run{" "}
                <code className="small">flask init-templates</code> first).
              </span>
            )}
          </p>
          {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-12">
                <label className="field-label" htmlFor="grid-paystub-employee">
                  Employee
                </label>
                <select
                  className="form-select"
                  id="grid-paystub-employee"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                >
                  <option value="">Select an employee</option>
                  {useApi
                    ? apiEmployees.map((emp) => (
                        <option key={emp.id} value={String(emp.id)}>
                          {apiEmployeeLabel(emp)} ({emp.employee_id})
                        </option>
                      ))
                    : localEmployees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                </select>
              </div>
              {useApi && (
                <div className="col-12">
                  <label className="field-label" htmlFor="grid-paystub-template">
                    Template slug
                  </label>
                  <input
                    className="form-control"
                    id="grid-paystub-template"
                    type="text"
                    value={templateSlug}
                    onChange={(e) => setTemplateSlug(e.target.value)}
                    placeholder="pay-stub-standard"
                  />
                </div>
              )}
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-paystub-start-date">
                  Pay Period Start
                </label>
                <input
                  className="form-control"
                  id="grid-paystub-start-date"
                  type="date"
                  value={payPeriodStart}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-paystub-end-date">
                  Pay Period End
                </label>
                <input
                  className="form-control"
                  id="grid-paystub-end-date"
                  type="date"
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
                  required
                />
              </div>
              <div className="col-12">
                <label className="field-label" htmlFor="grid-paystub-gross-pay">
                  Gross Pay
                </label>
                <input
                  className="form-control"
                  id="grid-paystub-gross-pay"
                  type="number"
                  step="0.01"
                  placeholder="5000"
                  value={grossPay}
                  onChange={(e) => setGrossPay(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="mt-4 d-flex align-items-center gap-3 flex-wrap">
              <button className="btn btn-pr-primary" type="submit" disabled={busy}>
                {busy ? "Generating…" : "Generate Pay Stub"}
              </button>
              {message && <span className="status-success">{message}</span>}
            </div>
          </form>
        </div>
      </div>

      {apiResult && (
        <div className="col-xl-8">
          <div className="result-card">
            <h2 className="h4 fw-bold mb-3">Generated Pay Stub (API)</h2>
            <div className="row g-3">
              <div className="col-md-6">
                <div className="grid-highlight">
                  <p className="mb-1">
                    <strong>Stub id:</strong> {apiResult.id}
                  </p>
                  <p className="mb-1">
                    <strong>Pay date:</strong> {apiResult.pay_date ?? "—"}
                  </p>
                  <p className="mb-0">
                    <strong>Period:</strong> {apiResult.pay_period_start ?? "—"} —{" "}
                    {apiResult.pay_period_end ?? "—"}
                  </p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="grid-highlight">
                  <p className="mb-1">
                    <strong>Gross:</strong>{" "}
                    {apiResult.gross_pay != null ? `$${apiResult.gross_pay.toFixed(2)}` : "—"}
                  </p>
                  <p className="mb-0">
                    <strong>Net:</strong>{" "}
                    {apiResult.net_pay != null ? `$${apiResult.net_pay.toFixed(2)}` : "—"}
                  </p>
                </div>
              </div>
            </div>
            <p className="small text-secondary mt-3 mb-0">
              Downloads: use <Link href="/portal/employee">My pay stubs</Link> or the API download
              routes.
            </p>
          </div>
        </div>
      )}

      {localStub && (
        <div className="col-xl-8">
          <div className="result-card">
            <h2 className="h4 fw-bold mb-3">Generated Pay Stub (local demo)</h2>
            <div className="row g-3">
              <div className="col-md-6">
                <div className="grid-highlight">
                  <p className="mb-1">
                    <strong>Employee:</strong>{" "}
                    {localEmployees.find((e) => e.id === localStub.employeeId)?.name}
                  </p>
                  <p className="mb-1">
                    <strong>Pay Date:</strong> {localStub.payDate}
                  </p>
                  <p className="mb-0">
                    <strong>Pay Period:</strong> {localStub.payPeriodStart} - {localStub.payPeriodEnd}
                  </p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="grid-highlight">
                  <p className="mb-1">
                    <strong>Gross Pay:</strong> ${localStub.grossPay.toFixed(2)}
                  </p>
                  <p className="mb-1">
                    <strong>Taxes:</strong> ${localStub.taxes.toFixed(2)}
                  </p>
                  <p className="mb-1">
                    <strong>Deductions:</strong> ${localStub.deductions.toFixed(2)}
                  </p>
                  <p className="mb-0">
                    <strong>Net Pay:</strong> ${localStub.netPay.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
