"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ApiEmployer, employeesApi, employersApi } from "@/lib/api";

type Row = {
  id: number;
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  employment_status: string | null;
  employer_id: number | null;
  user_id: number | null;
  pay_rate: number | null;
  pay_frequency: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  hire_date: string | null;
};

const emptyCreate = () => ({
  employee_id: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address_line1: "",
  city: "",
  state: "",
  zip_code: "",
  pay_rate: "",
  pay_frequency: "biweekly",
  employment_status: "active",
  employer_id: "",
  user_id: "",
  hire_date: "",
});

export default function AdminEmployeesPage() {
  const { user, loading, isAdmin, isEmployer } = useAuth();
  const canAccess = Boolean(user && (isAdmin || isEmployer));

  const [rows, setRows] = useState<Row[]>([]);
  const [employers, setEmployers] = useState<ApiEmployer[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    employment_status: "active",
    employer_id: "",
    user_id: "",
    pay_rate: "",
    pay_frequency: "biweekly",
    address_line1: "",
    city: "",
    state: "",
    zip_code: "",
    hire_date: "",
  });

  const load = useCallback(async () => {
    if (!canAccess) return;
    setErr(null);
    try {
      const [er, em] = await Promise.all([
        employeesApi.getAll(),
        employersApi.getAll(),
      ]);
      setRows((er.employees as Row[]) ?? []);
      setEmployers(em.employers);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [canAccess]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canAccess || employers.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await employersApi.getDefault();
        if (cancelled || !d.employer) return;
        const id = d.employer.id;
        if (!employers.some((e) => e.id === id)) return;
        setCreateForm((f) => {
          if (f.employer_id) return f;
          return { ...f, employer_id: String(id) };
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAccess, employers]);

  const employerLabel = (id: number | null) => {
    if (id == null) return "—";
    const e = employers.find((x) => x.id === id);
    return e?.company_name ?? `#${id}`;
  };

  const startEdit = (r: Row) => {
    setCreating(false);
    setEditingId(r.id);
    setForm({
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      employment_status: r.employment_status ?? "active",
      employer_id: r.employer_id != null ? String(r.employer_id) : "",
      user_id: r.user_id != null ? String(r.user_id) : "",
      pay_rate: r.pay_rate != null ? String(r.pay_rate) : "",
      pay_frequency: r.pay_frequency ?? "biweekly",
      address_line1: r.address_line1 ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip_code: r.zip_code ?? "",
      hire_date: r.hire_date ? r.hire_date.slice(0, 10) : "",
    });
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        employment_status: form.employment_status || "active",
        employer_id: form.employer_id ? Number(form.employer_id) : null,
        pay_frequency: form.pay_frequency || null,
        address_line1: form.address_line1 || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zip_code || null,
        hire_date: form.hire_date || null,
      };
      if (form.pay_rate.trim()) {
        body.pay_rate = Number(form.pay_rate);
      }
      if (form.user_id.trim()) {
        body.user_id = Number(form.user_id);
      } else {
        body.user_id = null;
      }
      await employeesApi.update(editingId, body);
      setEditingId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const saveCreate = async () => {
    const code = createForm.employee_id.trim();
    if (!code) {
      setErr("Employee code (employee_id) is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await employeesApi.create({
        employee_id: code,
        first_name: createForm.first_name || undefined,
        last_name: createForm.last_name || undefined,
        email: createForm.email || undefined,
        phone: createForm.phone || undefined,
        address_line1: createForm.address_line1 || undefined,
        city: createForm.city || undefined,
        state: createForm.state || undefined,
        zip_code: createForm.zip_code || undefined,
        pay_frequency: createForm.pay_frequency || undefined,
        employment_status: createForm.employment_status || "active",
        employer_id: createForm.employer_id ? Number(createForm.employer_id) : undefined,
        user_id: createForm.user_id.trim() ? Number(createForm.user_id) : undefined,
        pay_rate: createForm.pay_rate.trim() ? Number(createForm.pay_rate) : undefined,
        hire_date: createForm.hire_date || undefined,
      });
      setCreateForm(emptyCreate());
      setCreating(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(`Delete employee #${id}? This cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await employeesApi.delete(id);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
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

  if (!user || !canAccess) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Employees</h1>
            <p className="text-secondary mb-3">Admin or employer sign-in required.</p>
            <Link href="/login" className="btn btn-pr-primary btn-sm me-2">
              Sign in
            </Link>
            <Link href="/" className="btn btn-outline-secondary btn-sm">
              Home
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
            <h1 className="h2 fw-bold section-title mb-0">Employees</h1>
            <p className="small text-secondary mb-0">
              <code className="small">GET/POST/PUT /api/employees</code>
              {isAdmin ? " · DELETE admin only" : ""} ·{" "}
              <Link href="/employee">Public add form</Link>
            </p>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-pr-primary btn-sm"
              disabled={busy}
              onClick={() => {
                setEditingId(null);
                setCreating(true);
                setCreateForm(emptyCreate());
              }}
            >
              Add employee
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => load()}
              disabled={busy}
            >
              Refresh
            </button>
            {isAdmin ? (
              <Link href="/admin" className="btn btn-outline-primary btn-sm">
                Admin home
              </Link>
            ) : (
              <Link href="/admin/generate" className="btn btn-outline-primary btn-sm">
                Batch stubs
              </Link>
            )}
          </div>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}

        {creating && (
          <div className="form-card mb-4">
            <h2 className="h6 fw-bold mb-3">New employee</h2>
            <div className="row g-2">
              <div className="col-md-4">
                <label className="form-label small">Employee ID *</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.employee_id}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, employee_id: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">Email</label>
                <input
                  className="form-control form-control-sm"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">Phone</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">First name</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.first_name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, first_name: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Last name</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.last_name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, last_name: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Pay rate</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  step="0.01"
                  value={createForm.pay_rate}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, pay_rate: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Pay frequency</label>
                <select
                  className="form-select form-select-sm"
                  value={createForm.pay_frequency}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, pay_frequency: e.target.value }))
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="semi-monthly">Semi-monthly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="col-12">
                <label className="form-label small">Address line 1</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.address_line1}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, address_line1: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">City</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.city}
                  onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">State</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.state}
                  onChange={(e) => setCreateForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">ZIP</label>
                <input
                  className="form-control form-control-sm"
                  value={createForm.zip_code}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, zip_code: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">Employer</label>
                <select
                  className="form-select form-select-sm"
                  value={createForm.employer_id}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, employer_id: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {employers.map((er) => (
                    <option key={er.id} value={String(er.id)}>
                      {er.company_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label small">Linked user id</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  placeholder="optional"
                  value={createForm.user_id}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, user_id: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">Hire date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={createForm.hire_date}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, hire_date: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-3 d-flex gap-2">
              <button
                type="button"
                className="btn btn-pr-primary btn-sm"
                disabled={busy}
                onClick={saveCreate}
              >
                Create
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {editingId != null && (
          <div className="form-card mb-4">
            <h2 className="h6 fw-bold mb-3">Edit employee #{editingId}</h2>
            <div className="row g-2">
              <div className="col-md-3">
                <label className="form-label small">First name</label>
                <input
                  className="form-control form-control-sm"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Last name</label>
                <input
                  className="form-control form-control-sm"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Email</label>
                <input
                  className="form-control form-control-sm"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Phone</label>
                <input
                  className="form-control form-control-sm"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Address line 1</label>
                <input
                  className="form-control form-control-sm"
                  value={form.address_line1}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address_line1: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">City</label>
                <input
                  className="form-control form-control-sm"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">State</label>
                <input
                  className="form-control form-control-sm"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small">ZIP</label>
                <input
                  className="form-control form-control-sm"
                  value={form.zip_code}
                  onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Status</label>
                <input
                  className="form-control form-control-sm"
                  value={form.employment_status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, employment_status: e.target.value }))
                  }
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Employer</label>
                <select
                  className="form-select form-select-sm"
                  value={form.employer_id}
                  onChange={(e) => setForm((f) => ({ ...f, employer_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {employers.map((er) => (
                    <option key={er.id} value={String(er.id)}>
                      {er.company_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small">Pay rate</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  step="0.01"
                  value={form.pay_rate}
                  onChange={(e) => setForm((f) => ({ ...f, pay_rate: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Pay frequency</label>
                <select
                  className="form-select form-select-sm"
                  value={form.pay_frequency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pay_frequency: e.target.value }))
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="semi-monthly">Semi-monthly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small">Hire date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={form.hire_date}
                  onChange={(e) => setForm((f) => ({ ...f, hire_date: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Linked user id</label>
                <input
                  className="form-control form-control-sm"
                  type="number"
                  placeholder="optional"
                  value={form.user_id}
                  onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3 d-flex gap-2">
              <button
                type="button"
                className="btn btn-pr-primary btn-sm"
                disabled={busy}
                onClick={saveEdit}
              >
                Save
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setEditingId(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="table-responsive border rounded bg-white">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Employer</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-monospace small">{r.id}</td>
                  <td className="small">{r.employee_id}</td>
                  <td className="small">
                    {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="small">{r.email ?? "—"}</td>
                  <td className="small">{employerLabel(r.employer_id)}</td>
                  <td className="small">{r.employment_status ?? "—"}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-link btn-sm py-0"
                      onClick={() => startEdit(r)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm py-0 text-danger"
                        onClick={() => remove(r.id)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !err && (
          <p className="text-secondary small mt-3 mb-0">No employees in the database.</p>
        )}
      </div>
    </div>
  );
}
