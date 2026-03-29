"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { adminApi, ApiTemplate, templatesApi } from "@/lib/api";

export default function AdminTemplatesPage() {
  const { user, loading, isAdmin } = useAuth();
  const [rows, setRows] = useState<ApiTemplate[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regSlug, setRegSlug] = useState("");
  const [regName, setRegName] = useState("");
  const [regType, setRegType] = useState<"pay_stub" | "bank_statement">("pay_stub");
  const [regDesc, setRegDesc] = useState("");
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [zipSlug, setZipSlug] = useState("");

  const load = useCallback(async () => {
    if (!user || !isAdmin) return;
    setErr(null);
    try {
      const res = await templatesApi.list();
      setRows(res.templates ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [user, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (t: ApiTemplate) => {
    const next = !(t.is_active ?? false);
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await templatesApi.update(t.id, { is_active: next });
      setMsg(`Template "${t.name}" is now ${next ? "active" : "inactive"}.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const sync = async (id: number, name: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await templatesApi.syncFields(id);
      setMsg(
        `Synced fields for "${name}" (${r.registered_or_updated_fields ?? 0} registry rows).`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const dup = async (t: ApiTemplate) => {
    const name = window.prompt("Name for duplicate template row", `${t.name} (Copy)`);
    if (!name) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await templatesApi.duplicate(t.id, name);
      setMsg("Duplicate created (new slug; shares gallery folder with source).");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  };

  const registerFromDisk = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = regSlug.trim();
    if (!slug) {
      setErr("Folder slug is required (must match template-gallery/<slug>).");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await templatesApi.create({
        slug,
        name: (regName.trim() || slug) as string,
        type: regType,
        description: regDesc.trim() || undefined,
      });
      setMsg(`Registered template "${slug}".`);
      setRegSlug("");
      setRegName("");
      setRegDesc("");
      await load();
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Register failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadGalleryZip = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = zipInputRef.current?.files?.[0];
    if (!file) {
      setErr("Choose a ZIP file.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await adminApi.uploadGalleryZip(file, zipSlug.trim() || undefined);
      setMsg(
        `Installed gallery folder "${r.slug}" and registered template id ${r.template_id ?? "?"}.`
      );
      setZipSlug("");
      if (zipInputRef.current) zipInputRef.current.value = "";
      await load();
    } catch (err) {
      setErr(err instanceof Error ? err.message : "ZIP upload failed");
    } finally {
      setBusy(false);
    }
  };

  const syncGallery = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await adminApi.syncGalleryTemplates();
      setMsg(
        `Gallery scan complete: ${r.registered_new} new template row(s) (same as flask init-templates).`
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gallery sync failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async (t: ApiTemplate) => {
    if (
      !window.confirm(
        `Delete template "${t.name}" (${t.slug}) from the database? Files on disk are not removed.`
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await templatesApi.delete(t.id);
      setMsg("Template deleted.");
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
            <h1 className="h3 fw-bold mb-2">Templates</h1>
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
            <h1 className="h2 fw-bold section-title mb-0">Templates</h1>
            <p className="small text-secondary mb-0">
              Registered rows + field registry sync. Gallery:{" "}
              <Link href="/templates/gallery">/templates/gallery</Link>
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={syncGallery}
              disabled={busy}
              title="POST /api/admin/sync-gallery-templates"
            >
              Register from gallery
            </button>
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
        {msg && <div className="alert alert-success py-2 small mb-3">{msg}</div>}

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-2">Upload template ZIP</h2>
          <p className="small text-secondary mb-3">
            Extracts into <code className="small">template-gallery/&lt;slug&gt;/</code> and registers the
            template (same as a new on-disk folder + sync). Max ~12&nbsp;MB. Layout: either{" "}
            <strong>one top-level folder</strong> (name = slug) containing{" "}
            <code className="small">template.html</code> + <code className="small">schema.json</code>, or
            those two files at the ZIP root with a <strong>slug</strong> below.
          </p>
          <form className="row g-2 align-items-end" onSubmit={uploadGalleryZip}>
            <div className="col-md-5">
              <label className="form-label small mb-0">ZIP file</label>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                className="form-control form-control-sm"
                disabled={busy}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small mb-0">Slug (if ZIP root is flat)</label>
              <input
                className="form-control form-control-sm font-monospace"
                placeholder="only when files are not inside one folder"
                value={zipSlug}
                onChange={(e) => setZipSlug(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="col-md-3">
              <button type="submit" className="btn btn-outline-primary btn-sm w-100" disabled={busy}>
                Upload &amp; register
              </button>
            </div>
          </form>
        </div>

        <div className="form-card mb-4">
          <h2 className="h6 fw-bold mb-2">Register template from gallery folder</h2>
          <p className="small text-secondary mb-3">
            Add a <code className="small">template-gallery/&lt;slug&gt;/</code> folder on the server first
            (with <code className="small">template.html</code> + <code className="small">schema.json</code>
            ), then submit. Same as <code className="small">POST /api/templates</code>. For bulk missing
            rows use <strong>Register from gallery</strong> above.
          </p>
          <form className="row g-2 align-items-end" onSubmit={registerFromDisk}>
            <div className="col-md-3">
              <label className="form-label small mb-0">Slug</label>
              <input
                className="form-control form-control-sm"
                placeholder="my-template"
                value={regSlug}
                onChange={(e) => setRegSlug(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small mb-0">Display name</label>
              <input
                className="form-control form-control-sm"
                placeholder="defaults to slug"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small mb-0">Type</label>
              <select
                className="form-select form-select-sm"
                value={regType}
                onChange={(e) =>
                  setRegType(e.target.value as "pay_stub" | "bank_statement")
                }
                disabled={busy}
              >
                <option value="pay_stub">pay_stub</option>
                <option value="bank_statement">bank_statement</option>
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small mb-0">Description</label>
              <input
                className="form-control form-control-sm"
                value={regDesc}
                onChange={(e) => setRegDesc(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="col-md-1">
              <button type="submit" className="btn btn-primary btn-sm w-100" disabled={busy}>
                Add
              </button>
            </div>
          </form>
        </div>

        <div className="table-responsive border rounded bg-white">
          <table className="table table-sm table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Type</th>
                <th>Ver</th>
                <th>Active</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="font-monospace small">{t.id}</td>
                  <td className="small">{t.name}</td>
                  <td className="small font-monospace">{t.slug}</td>
                  <td className="small">{t.type}</td>
                  <td className="small">{t.version ?? "—"}</td>
                  <td>
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={Boolean(t.is_active)}
                        onChange={() => toggleActive(t)}
                        disabled={busy}
                        id={`act-${t.id}`}
                      />
                      <label className="form-check-label small" htmlFor={`act-${t.id}`}>
                        {t.is_active ? "on" : "off"}
                      </label>
                    </div>
                  </td>
                  <td className="text-end text-nowrap">
                    <button
                      type="button"
                      className="btn btn-link btn-sm py-0"
                      onClick={() => sync(t.id, t.name)}
                      disabled={busy}
                    >
                      Sync fields
                    </button>
                    <button
                      type="button"
                      className="btn btn-link btn-sm py-0"
                      onClick={() => dup(t)}
                      disabled={busy}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-link btn-sm py-0 text-danger"
                      onClick={() => del(t)}
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
          <p className="text-secondary small mt-3 mb-0">
            No templates — run <code className="small">flask init-templates</code> on the API.
          </p>
        )}
      </div>
    </div>
  );
}
