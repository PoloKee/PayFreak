"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ApiEmployer, employersApi } from "@/lib/api";

export default function AdminEmployersPage() {
  const { user, loading, isAdmin } = useAuth();
  const [rows, setRows] = useState<ApiEmployer[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    phone: "",
    email: "",
    tax_id: "",
    logo_path: "",
  });

  const load = useCallback(async () => {
    if (!user || !isAdmin) return;
    setErr(null);
    try {
      const res = await employersApi.getAll();
      setRows(res.employers);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [user, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (r: ApiEmployer) => {
    setEditingId(r.id);
    setForm({
      company_name: r.company_name,
      address: r.address ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip_code: r.zip_code ?? "",
      phone: r.phone ?? "",
      email: r.email ?? "",
      tax_id: r.tax_id ?? "",
      logo_path: r.logo_path ?? "",
    });
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    setBusy(true);
    setErr(null);
    try {
      await employersApi.update(editingId, {
        company_name: form.company_name,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip_code: form.zip_code || null,
        phone: form.phone || null,
        email: form.email || null,
        tax_id: form.tax_id || null,
        logo_path: form.logo_path || null,
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(`Delete employer #${id}? Fails if employees still reference it.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await employersApi.delete(id);
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

  if (!user || !isAdmin) {
    return (
      <div className="row justify-content-center py-5">
        <div className="col-lg-8">
          <div className="form-card">
            <h1 className="h3 fw-bold mb-2">Employers</h1>
            <p className="text-secondary mb-3">Admin only.</p>
            <Link href="/admin" className="btn btn-outline-secondary btn-sm">
              Back to admin
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
            <h1 className="h2 fw-bold section-title mb-0">Employers</h1>
            <p className="small text-secondary mb-0">
              <code className="small">GET/PUT/DELETE /api/employers</code> ·{" "}
              <Link href="/employer">Add employer</Link>
            </p>
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => load()}
              disabled={busy}
            >
              Refresh
            </button>
            <Link href="/admin" className="btn btn-outline-primary btn-sm">
              Admin home
            </Link>
          </div>
        </div>

        {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}

        {editingId != null && (
          <div className="form-card mb-4">
            <h2 className="h6 fw-bold mb-3">Edit employer #{editingId}</h2>
            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small">Company name</label>
                <input
                  className="form-control form-control-sm"
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small">Tax ID</label>
                <input
                  className="form-control form-control-sm"
                  value={form.tax_id}
                  onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Address</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
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
              <div className="col-md-2">
                <label className="form-label small">State</label>
                <input
                  className="form-control form-control-sm"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small">Zip</label>
                <input
                  className="form-control form-control-sm"
                  value={form.zip_code}
                  onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
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
              <div className="col-md-6">
                <label className="form-label small">Email</label>
                <input
                  className="form-control form-control-sm"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <label className="form-label small">Logo path</label>
                <input
                  className="form-control form-control-sm font-monospace"
                  value={form.logo_path}
                  onChange={(e) => setForm((f) => ({ ...f, logo_path: e.target.value }))}
                  placeholder="/template-gallery/… or stored path"
                />
                <p className="form-text small mb-0">
                  URL or path the API can resolve for PDFs (often under{" "}
                  <code className="small">/template-gallery/</code>).
                </p>
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
                <th>Company</th>
                <th>City</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-monospace small">{r.id}</td>
                  <td className="small">{r.company_name}</td>
                  <td className="small">{r.city ?? "—"}</td>
                  <td className="small">{r.phone ?? "—"}</td>
                  <td className="small">{r.email ?? "—"}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-link btn-sm py-0"
                      onClick={() => startEdit(r)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-link btn-sm py-0 text-danger"
                      onClick={() => remove(r.id)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !err && (
          <p className="text-secondary small mt-3 mb-0">No employers yet.</p>
        )}
      </div>
    </div>
  );
}
