"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import { Section } from "@/components/user/settings/Section";

interface Me {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  memory_consent: boolean;
  language: string;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  address_country: string | null;
  billing_same_as_address: boolean;
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  billing_country: string | null;
  two_fa_enabled: boolean;
  phone_verified: boolean;
  notification_channel: "sms" | "email";
}

interface ProfileSectionProps {
  me: Me;
  baddieEmail?: string | null;
  onLanguageChange?: (lang: string) => void;
}

const LANGUAGES = [
  { value: "de",  label: "Deutsch" },
  { value: "gsw", label: "Schweizerdeutsch" },
  { value: "en",  label: "English" },
  { value: "fr",  label: "Français" },
  { value: "it",  label: "Italiano" },
  { value: "es",  label: "Español" },
  { value: "pt",  label: "Português" },
  { value: "nl",  label: "Nederlands" },
  { value: "pl",  label: "Polski" },
  { value: "tr",  label: "Türkçe" },
];

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";

export function ProfileSection({ me, baddieEmail, onLanguageChange }: ProfileSectionProps) {
  const [rufname, setRufname] = useState(me.name ?? "");
  const [firstName, setFirstName] = useState(me.first_name ?? "");
  const [lastName, setLastName] = useState(me.last_name ?? "");
  const [language, setLanguage] = useState(me.language ?? "de");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [street, setStreet] = useState(me.address_street ?? "");
  const [zip, setZip] = useState(me.address_zip ?? "");
  const [city, setCity] = useState(me.address_city ?? "");
  const [country, setCountry] = useState(me.address_country ?? "Schweiz");
  const [billingSame, setBillingSame] = useState(me.billing_same_as_address ?? true);
  const [billingStreet, setBillingStreet] = useState(me.billing_street ?? "");
  const [billingZip, setBillingZip] = useState(me.billing_zip ?? "");
  const [billingCity, setBillingCity] = useState(me.billing_city ?? "");
  const [billingCountry, setBillingCountry] = useState(me.billing_country ?? "Schweiz");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const saveProfile = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/v1/customers/me`, {
        method: "PATCH",
        body: JSON.stringify({
          name: rufname || firstName || me.name,
          first_name: firstName || null,
          last_name: lastName || null,
          language,
          phone: phone || null,
          address_street: street || null,
          address_zip: zip || null,
          address_city: city || null,
          address_country: country || null,
          billing_same_as_address: billingSame,
          billing_street: billingSame ? null : (billingStreet || null),
          billing_zip: billingSame ? null : (billingZip || null),
          billing_city: billingSame ? null : (billingCity || null),
          billing_country: billingSame ? null : (billingCountry || null),
        }),
      });
      // Sprache auch in ui_preferences synchronisieren
      apiFetch(`${BACKEND_URL}/v1/user/preferences`, {
        method: "POST",
        body: JSON.stringify({ language }),
      }).catch(() => {});
      if (res.ok) {
        setMsg({ text: "Gespeichert ✓", ok: true });
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg({ text: "Fehler beim Speichern", ok: false });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Persönliche Daten */}
      <Section title="Profil" icon="👤">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Rufname <span className="text-gray-600">(wie Baddi dich anspricht)</span></label>
            <input value={rufname} onChange={(e) => setRufname(e.target.value)} placeholder="z. B. Naor" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Vorname <span className="text-gray-600">(rechtlich)</span></label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Max" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Nachname <span className="text-gray-600">(rechtlich)</span></label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Muster" className={inputCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">E-Mail</label>
            <input value={me.email} disabled className={`${inputCls} opacity-50 cursor-not-allowed`} />
          </div>
          {baddieEmail && (
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">
                Baddi Email
                <span className="ml-2 text-[10px] text-indigo-400 font-normal">Deine persönliche Baddi-Adresse</span>
              </label>
              <div className="flex items-center gap-2">
                <input value={baddieEmail} disabled className={`${inputCls} opacity-70 cursor-default font-mono text-indigo-300`} />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(baddieEmail)}
                  title="Kopieren"
                  className="shrink-0 px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-indigo-500 transition-colors text-xs"
                >
                  📋
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Mobile</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+41 79 000 00 00" className={inputCls} />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-400 font-medium">Sprache</label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map((l) => (
                <button key={l.value} type="button" onClick={() => { setLanguage(l.value); onLanguageChange?.(l.value); }}
                  className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                    language === l.value
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600">Gilt auch als Chat-Sprache.</p>
          </div>
        </div>
      </Section>

      {/* Adresse */}
      <Section title="Adresse" icon="🏠">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Strasse & Hausnummer</label>
            <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Musterstrasse 1" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">PLZ</label>
              <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="8001" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium">Ort</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Zürich" className={inputCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Land</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Schweiz" className={inputCls} />
          </div>
        </div>
      </Section>

      {/* Rechnungsadresse */}
      <Section title="Rechnungsadresse" icon="🧾">
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setBillingSame(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative ${billingSame ? "bg-indigo-600" : "bg-gray-700"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${billingSame ? "left-5" : "left-0.5"}`} />
            </div>
            <span className="text-sm text-gray-300">Gleich wie Adresse</span>
          </label>

          {!billingSame && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Strasse & Hausnummer</label>
                <input value={billingStreet} onChange={(e) => setBillingStreet(e.target.value)} placeholder="Musterstrasse 1" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">PLZ</label>
                  <input value={billingZip} onChange={(e) => setBillingZip(e.target.value)} placeholder="8001" className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Ort</label>
                  <input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} placeholder="Zürich" className={inputCls} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Land</label>
                <input value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} placeholder="Schweiz" className={inputCls} />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Speichern */}
      <div className="flex items-center gap-3">
        <button onClick={saveProfile} disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-50">
          {saving ? "Speichern…" : "Speichern"}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</span>}
      </div>
    </>
  );
}
