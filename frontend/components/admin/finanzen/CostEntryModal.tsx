"use client";

import { CATEGORIES, PAYMENT_METHODS } from "@/components/admin/finanzen/types";
import type { CostEntry, BillingCycle, Currency, PaymentMethod } from "@/components/admin/finanzen/types";

type FormData = Omit<CostEntry, "id" | "balance_updated_at">;

interface Props {
  form: FormData;
  editEntry: CostEntry | null;
  saving: boolean;
  onFieldChange: (patch: Partial<FormData>) => void;
  onAmountChange: (patch: Partial<FormData>) => void;
  onSave: () => void;
  onClose: () => void;
}

const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500";

export default function CostEntryModal({ form, editEntry, saving, onFieldChange, onAmountChange, onSave, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-bold text-white">{editEntry ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Name *</label>
              <input value={form.name} onChange={e => onFieldChange({ name: e.target.value })}
                className={inputCls} placeholder="z.B. Gemini API" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Anbieter</label>
              <input value={form.provider} onChange={e => onFieldChange({ provider: e.target.value })}
                className={inputCls} placeholder="z.B. Google" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Kategorie</label>
              <select value={form.category} onChange={e => onFieldChange({ category: e.target.value as CostEntry["category"] })} className={inputCls}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Abrechnungsturnus</label>
              <select value={form.billing_cycle} onChange={e => onAmountChange({ billing_cycle: e.target.value as BillingCycle })} className={inputCls}>
                <option value="monatlich">Monatlich</option>
                <option value="jährlich">Jährlich</option>
                <option value="einmalig">Einmalig</option>
                <option value="nutzungsbasiert">Nutzungsbasiert</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">CAPEX inkl. MwSt.</label>
              <input type="number" step="0.01" min="0" value={form.amount_original}
                onChange={e => onAmountChange({ amount_original: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Währung</label>
              <select value={form.currency} onChange={e => onAmountChange({ currency: e.target.value as Currency })} className={inputCls}>
                <option>CHF</option><option>USD</option><option>EUR</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">CHF / Monat</label>
              <input type="number" step="0.01" min="0" value={form.amount_chf_monthly}
                onChange={e => onFieldChange({ amount_chf_monthly: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 border border-yellow-900/50 rounded-lg px-3 py-2 text-sm text-yellow-300 outline-none focus:border-yellow-500" />
            </div>
          </div>
          <p className="text-xs text-gray-600">CHF/Monat wird automatisch berechnet (jährlich ÷ 12, USD × 0.90, EUR × 0.96). Manuell überschreibbar.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">Zahlungsart</label>
              <select
                value={form.payment_method ?? ""}
                onChange={e => onFieldChange({ payment_method: (e.target.value || null) as PaymentMethod | null })}
                className={inputCls}
              >
                <option value="">— keine Angabe —</option>
                {PAYMENT_METHODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            {form.payment_method === "kreditkarte" && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400">Karte (letzte 4 Ziffern)</label>
                <input
                  value={form.card_last4 ?? ""}
                  onChange={e => onFieldChange({ card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) || null })}
                  className={inputCls}
                  placeholder="z.B. 4242"
                  maxLength={4}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Aktuelles Guthaben (CHF) — optional</label>
            <input type="number" step="0.01" value={form.balance_chf ?? ""}
              onChange={e => onFieldChange({ balance_chf: e.target.value === "" ? null : parseFloat(e.target.value) })}
              className={inputCls} placeholder="z.B. 18.50" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Billing-URL (optional)</label>
            <input value={form.url ?? ""} onChange={e => onFieldChange({ url: e.target.value })}
              className={inputCls} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">Notizen</label>
            <textarea rows={2} value={form.notes ?? ""} onChange={e => onFieldChange({ notes: e.target.value })}
              className={`${inputCls} resize-none`} />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => onFieldChange({ is_active: !form.is_active })}
              className={`w-10 h-5 rounded-full transition-colors relative ${form.is_active ? "bg-yellow-400" : "bg-gray-700"}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-gray-300">Aktiv (in Kostenberechnung einbeziehen)</span>
          </label>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onSave} disabled={saving || !form.name.trim()}
            className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-bold py-2 rounded-xl text-sm transition-colors">
            {saving ? "Speichere…" : editEntry ? "Speichern" : "Hinzufügen"}
          </button>
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
