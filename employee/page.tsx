"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ApiEmployer, employeesApi, employersApi } from "@/lib/api";
import { addEmployee, getEmployers } from "./actions";
import type { Employer as LocalEmployer } from "@/lib/schema";

export default function AddEmployee() {
  const { user, loading, isAdmin, isEmployer } = useAuth();
  const useApi = Boolean(user && (isAdmin || isEmployer));

  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [ssn, setSsn] = useState("");
  const [bankingInfo, setBankingInfo] = useState("");
  const [employerId, setEmployerId] = useState("");
  const [apiEmployers, setApiEmployers] = useState<ApiEmployer[]>([]);
  const [localEmployers, setLocalEmployers] = useState<LocalEmployer[]>([]);
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (useApi) {
        try {
          const res = await employersApi.getAll();
          if (!cancelled) setApiEmployers(res.employers);
          try {
            const def = await employersApi.getDefault();
            if (
              !cancelled &&
              def.employer &&
              res.employers.some((e) => e.id === def.employer!.id)
            ) {
              setEmployerId((prev) => prev || String(def.employer!.id));
            }
          } catch {
            /* ignore */
          }
        } catch {
          if (!cancelled) setApiEmployers([]);
        }
      } else {
        const employers = await getEmployers();
        if (!cancelled) setLocalEmployers(employers);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useApi]);

  const splitName = (full: string) => {
    const p = full.trim().split(/\s+/).filter(Boolean);
    if (p.length === 0) return { first_name: "", last_name: "" };
    if (p.length === 1) return { first_name: p[0], last_name: p[0] };
    return { first_name: p[0], last_name: p.slice(1).join(" ") };
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (useApi) {
        const code =
          employeeCode.trim() ||
          `E${Date.now().toString(36).toUpperCase()}`;
        const { first_name, last_name } = splitName(name);
        if (!employerId) {
          setError("Select an employer.");
          setBusy(false);
          return;
        }
        await employeesApi.create({
          employee_id: code,
          first_name,
          last_name,
          email: email || undefined,
          phone: phone || undefined,
          employer_id: Number(employerId),
          address_line1: address1 || undefined,
          address_line2: address2 || undefined,
          city: city || undefined,
          state: state || undefined,
          zip_code: zip || undefined,
          ssn,
          banking_notes: bankingInfo || undefined,
        });
        setMessage("Employee saved to API.");
        setName("");
        setEmployeeCode("");
        setSsn("");
        setBankingInfo("");
        setEmployerId("");
        setAddress1("");
        setAddress2("");
        setCity("");
        setState("");
        setZip("");
        setPhone("");
        setEmail("");
      } else {
        const result = await addEmployee({
          name,
          ssn,
          bankingInfo,
          employerId,
          address1,
          address2,
          city,
          state,
          zip,
          phone,
          email,
        });
        if (result.success) {
          setMessage("Saved to browser demo store (localStorage).");
          setName("");
          setSsn("");
          setBankingInfo("");
          setEmployerId("");
          setAddress1("");
          setAddress2("");
          setCity("");
          setState("");
          setZip("");
          setPhone("");
          setEmail("");
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
      <div className="col-lg-9 col-xl-8">
        <div className="form-card">
          <h1 className="h2 fw-bold section-title mb-2">Add New Employee</h1>
          <p className="section-subtitle mb-4">
            {useApi ? (
              <span className="text-success">Using Flask API (admin/employer).</span>
            ) : (
              <span>
                Demo mode (localStorage). Employer accounts must{" "}
                <Link href="/login">sign in</Link> to create employees in the database.
              </span>
            )}
          </p>
          {error && <div className="alert alert-danger py-2 small mb-3">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              {useApi && (
                <div className="col-md-6">
                  <label className="field-label" htmlFor="grid-employee-code">
                    Employee code (unique)
                  </label>
                  <input
                    className="form-control"
                    id="grid-employee-code"
                    type="text"
                    placeholder="Auto if empty"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                  />
                </div>
              )}
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-name">
                  Full name
                </label>
                <input
                  className="form-control"
                  id="grid-employee-name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-ssn">
                  SSN (last 4 stored on API)
                </label>
                <input
                  className="form-control"
                  id="grid-employee-ssn"
                  type="text"
                  placeholder="***-**-1234"
                  value={ssn}
                  onChange={(e) => setSsn(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-employer">
                  Employer
                </label>
                <select
                  className="form-select"
                  id="grid-employee-employer"
                  value={employerId}
                  onChange={(e) => setEmployerId(e.target.value)}
                  required={useApi}
                >
                  <option value="">Select an employer</option>
                  {useApi
                    ? apiEmployers.map((er) => (
                        <option key={er.id} value={String(er.id)}>
                          {er.company_name}
                        </option>
                      ))
                    : localEmployers.map((employer) => (
                        <option key={employer.id} value={employer.id}>
                          {employer.name}
                        </option>
                      ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-banking">
                  Banking Information
                </label>
                <textarea
                  className="form-control"
                  id="grid-employee-banking"
                  placeholder="Bank Name, Account #, Routing #"
                  value={bankingInfo}
                  onChange={(e) => setBankingInfo(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-address1">
                  Address 1
                </label>
                <input
                  className="form-control"
                  id="grid-employee-address1"
                  type="text"
                  placeholder="123 Main St"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-address2">
                  Address 2
                </label>
                <input
                  className="form-control"
                  id="grid-employee-address2"
                  type="text"
                  placeholder="Apt 4B"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-city">
                  City
                </label>
                <input
                  className="form-control"
                  id="grid-employee-city"
                  type="text"
                  placeholder="Anytown"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="field-label" htmlFor="grid-employee-state">
                  State
                </label>
                <input
                  className="form-control"
                  id="grid-employee-state"
                  type="text"
                  placeholder="CA"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label className="field-label" htmlFor="grid-employee-zip">
                  Zip Code
                </label>
                <input
                  className="form-control"
                  id="grid-employee-zip"
                  type="text"
                  placeholder="12345"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-phone">
                  Phone Number
                </label>
                <input
                  className="form-control"
                  id="grid-employee-phone"
                  type="text"
                  placeholder="(555) 555-5555"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="field-label" htmlFor="grid-employee-email">
                  Email Address
                </label>
                <input
                  className="form-control"
                  id="grid-employee-email"
                  type="email"
                  placeholder="john.doe@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-4">
              <button className="btn btn-pr-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Add Employee"}
              </button>
            </div>
            {message && <p className="mt-3 status-success mb-0">{message}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
