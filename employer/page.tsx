"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import CompanyDefaultsModal from "@/components/CompanyDefaultsModal";
import FormMemoryInput from "@/components/FormMemoryInput";
import { employersApi } from "@/lib/api";
import {
  applyBuiltinDefaults,
  loadSavedCompanyDefaults,
  type CompanyProfile,
} from "@/lib/defaultCompanyProfile";
import { FORM_EMPLOYER } from "@/lib/formFieldMemory";
import { addEmployer } from "./actions";

function applyCompanyToForm(
  p: CompanyProfile,
  setters: {
    setName: (v: string) => void;
    setAddress1: (v: string) => void;
    setAddress2: (v: string) => void;
    setCity: (v: string) => void;
    setState: (v: string) => void;
    setZip: (v: string) => void;
    setPhone: (v: string) => void;
    setEmail: (v: string) => void;
    setTaxId: (v: string) => void;
    setLogoPath: (v: string) => void;
  }
) {
  setters.setName(p.company_name);
  setters.setAddress1(p.address1);
  setters.setAddress2(p.address2);
  setters.setCity(p.city);
  setters.setState(p.state);
  setters.setZip(p.zip_code);
  setters.setPhone(p.phone);
  setters.setEmail(p.email);
  setters.setTaxId(p.tax_id);
  setters.setLogoPath(p.logo_path);
}

export default function AddEmployer() {
  const { user, loading, isAdmin, isEmployer } = useAuth();
  const useApi = Boolean(user && (isAdmin || isEmployer));

  const [name, setName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [logoPath, setLogoPath] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memoryEpoch, setMemoryEpoch] = useState(0);
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);

  const bumpMemory = () => setMemoryEpoch((e) => e + 1);

  const setters = {
    setName,
    setAddress1,
    setAddress2,
    setCity,
    setState,
    setZip,
    setPhone,
    setEmail,
    setTaxId,
    setLogoPath,
  };

  const fillBuiltinCompany = () => {
    setError(null);
    applyCompanyToForm(applyBuiltinDefaults(), setters);
    setMessage("Filled with sample company info.");
  };

  const fillSavedOrBuiltinCompany = () => {
    setError(null);
    const p = loadSavedCompanyDefaults() ?? applyBuiltinDefaults();
    applyCompanyToForm(p, setters);
    setMessage("Filled from saved defaults (or sample if none saved).");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (useApi) {
        const address = [address1, address2].filter(Boolean).join("\n") || undefined;
        await employersApi.create({
          company_name: name,
          address,
          city: city || undefined,
          state: state || undefined,
          zip_code: zip || undefined,
          phone: phone || undefined,
          email: email || undefined,
          tax_id: taxId || undefined,
          logo_path: logoPath || undefined,
        });
        setMessage("Employer saved to API (PostgreSQL).");
        setName("");
        setAddress1("");
        setAddress2("");
        setCity("");
        setState("");
        setZip("");
        setPhone("");
        setEmail("");
        setTaxId("");
        setLogoPath("");
      } else {
        const result = await addEmployer({
          name,
          address1,
          address2,
          city,
          state,
          zip,
          phone,
          email,
          taxId: taxId || undefined,
          logoPath: logoPath || undefined,
        });
        if (result.success) {
          setMessage("Saved to browser demo store (localStorage).");
          setName("");
          setAddress1("");
          setAddress2("");
          setCity("");
          setState("");
          setZip("");
          setPhone("");
          setEmail("");
          setTaxId("");
          setLogoPath("");
        } else {
          setMessage("");
          setError("Could not save.");
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
    <div className="row justify-content-center">
      <div className="col-lg-8 col-xl-7">
        <div className="form-card">
          <h1 className="h2 fw-bold section-title mb-2">Add New Employer</h1>
          <p className="section-subtitle mb-4">
            Company profile used on pay stubs.{" "}
            {useApi ? (
              <span className="text-success">Using Flask API (admin/employer).</span>
            ) : (
              <span>
                Demo mode: data stays in this browser only.{" "}
                <Link href="/login">Sign in</Link> as employer or admin to use the API.
              </span>
            )}
          </p>
          {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={fillBuiltinCompany}
            >
              Fill sample company
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={fillSavedOrBuiltinCompany}
            >
              Fill saved defaults
            </button>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => setDefaultsModalOpen(true)}
            >
              Edit company defaults…
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="field-label" htmlFor="grid-employer-name">
                Employer Name
              </label>
              <FormMemoryInput
                formId={FORM_EMPLOYER}
                fieldKey="name"
                memoryEpoch={memoryEpoch}
                onRemember={bumpMemory}
                className="form-control"
                id="grid-employer-name"
                type="text"
                placeholder="ACME Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-address1">
                  Address 1
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="address1"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-address1"
                  type="text"
                  placeholder="123 Main St"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-address2">
                  Address 2
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="address2"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-address2"
                  type="text"
                  placeholder="Suite 100"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                />
              </div>
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-city">
                  City
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="city"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-city"
                  type="text"
                  placeholder="Anytown"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="col-md-3 mb-3">
                <label className="field-label" htmlFor="grid-employer-state">
                  State
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="state"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-state"
                  type="text"
                  placeholder="CA"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div className="col-md-3 mb-3">
                <label className="field-label" htmlFor="grid-employer-zip">
                  Zip Code
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="zip"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-zip"
                  type="text"
                  placeholder="12345"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
              </div>
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-phone">
                  Phone Number
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="phone"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-phone"
                  type="text"
                  placeholder="(555) 555-5555"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-email">
                  Email Address
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="email"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-email"
                  type="email"
                  placeholder="contact@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-tax">
                  Tax ID
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="taxId"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control"
                  id="grid-employer-tax"
                  type="text"
                  placeholder="EIN or other tax identifier"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="field-label" htmlFor="grid-employer-logo">
                  Logo path
                </label>
                <FormMemoryInput
                  formId={FORM_EMPLOYER}
                  fieldKey="logoPath"
                  memoryEpoch={memoryEpoch}
                  onRemember={bumpMemory}
                  className="form-control font-monospace"
                  id="grid-employer-logo"
                  type="text"
                  placeholder="/template-gallery/…"
                  value={logoPath}
                  onChange={(e) => setLogoPath(e.target.value)}
                />
                <p className="form-text small mb-0">
                  Optional URL or path for pay stub branding (often under{" "}
                  <code className="small">/template-gallery/</code>).
                </p>
              </div>
            </div>
            <div className="d-flex justify-content-between align-items-center">
              <button className="btn btn-pr-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add Employer"}
              </button>
            </div>
            {message && <p className="mt-3 status-success mb-0">{message}</p>}
          </form>
        </div>
      </div>

      <CompanyDefaultsModal
        open={defaultsModalOpen}
        onClose={() => setDefaultsModalOpen(false)}
        onApply={(p) => {
          applyCompanyToForm(p, setters);
          setMessage("Applied company defaults to the form.");
        }}
      />
    </div>
  );
}
