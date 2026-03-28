"use client";

import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import {
  CustomerDetail,
  LANGUAGE_OPTIONS,
  formatDate,
  inputCls,
  readCls,
} from "@/lib/customer-admin-utils";
import { useState } from "react";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

interface Props {
  customer: CustomerDetail;
  onCustomerUpdate: (c: CustomerDetail) => void;
}

export default function CustomerProfileTab({ customer, onCustomerUpdate }: Props) {
  const [name, setName] = useState(customer.name ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [language, setLanguage] = useState(customer.language ?? "de");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [phoneSecondary, setPhoneSecondary] = useState(customer.phone_secondary ?? "");
  const [street, setStreet] = useState(customer.address_street ?? "");
  const [zip, setZip] = useState(customer.address_zip ?? "");
  const [city, setCity] = useState(customer.address_city ?? "");
  const [country, setCountry] = useState(customer.address_country ?? "Schweiz");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/${customer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name, email, language,
          phone: phone || null,
          phone_secondary: phoneSecondary || null,
          address_street: street || null,
          address_zip: zip || null,
          address_city: city || null,
          address_country: country || null,
        }),
      });
      if (res.ok) {
        onCustomerUpdate(await res.json());
        setSaveMsg("Gespeichert ✓");
        setTimeout(() => setSaveMsg(null), 3000);
      } else {
        setSaveMsg("Fehler beim Speichern");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* Stammdaten */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Stammdaten</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="E-Mail">
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} />
          </Field>
          <Field label="Bevorzugte Sprache">
            <select value={language} onChange={e => setLanguage(e.target.value)} className={inputCls}>
              {LANGUAGE_OPTIONS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Kontakt */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Kontakt</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Telefon (Mobil / Haupt)">
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+41 79 000 00 00" className={inputCls} />
          </Field>
          <Field label="Telefon 2 (Festnetz / Arbeit)">
            <input value={phoneSecondary} onChange={e => setPhoneSecondary(e.target.value)} placeholder="+41 44 000 00 00" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Adresse */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Adresse</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Strasse & Hausnummer">
            <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Musterstrasse 1" className={inputCls} />
          </Field>
          <Field label="Land">
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Schweiz" className={inputCls} />
          </Field>
          <Field label="PLZ">
            <input value={zip} onChange={e => setZip(e.target.value)} placeholder="8001" className={inputCls} />
          </Field>
          <Field label="Ort">
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Zürich" className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Speichern */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveProfile}
          disabled={saving}
          className="px-5 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg.includes("Fehler") ? "text-red-400" : "text-green-400"}`}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* Systeminfo */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Systeminfo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="ID">
            <p className={`font-mono text-xs ${readCls} select-all break-all`}>{customer.id}</p>
          </Field>
          <Field label="Rolle">
            <p className={readCls}>{customer.role}</p>
          </Field>
          <Field label="Registriert am">
            <p className={readCls}>{formatDate(customer.created_at)}</p>
          </Field>
        </div>
      </div>
    </div>
  );
}
