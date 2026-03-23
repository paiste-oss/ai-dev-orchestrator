"use client";

interface Invoice {
  id: string;
  invoice_number: string | null;
  amount_chf: number;
  vat_chf: number;
  amount_net_chf: number;
  description: string;
  payment_type: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface Props {
  invoices: Invoice[];
}

export default function BillingHistory({ invoices }: Props) {
  if (invoices.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-white">Rechnungen</h2>
      <div className="rounded-2xl border border-white/8 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-white/3 border-b border-white/8">
            <tr>
              <th className="text-left text-gray-500 font-medium px-4 py-3">Rechnungs-Nr.</th>
              <th className="text-left text-gray-500 font-medium px-4 py-3">Beschreibung</th>
              <th className="text-right text-gray-500 font-medium px-4 py-3">Betrag inkl. MwSt</th>
              <th className="text-right text-gray-500 font-medium px-4 py-3">Status</th>
              <th className="text-right text-gray-500 font-medium px-4 py-3">Datum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-white/2 transition-colors">
                <td className="px-4 py-3 text-gray-400 font-mono">
                  {inv.invoice_number ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-300">{inv.description}</td>
                <td className="px-4 py-3 text-right text-white font-medium">
                  CHF {inv.amount_chf.toFixed(2)}
                  <span className="text-gray-600 ml-1">(inkl. {inv.vat_chf.toFixed(2)} MwSt)</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold
                    ${inv.status === "succeeded" ? "text-green-400 bg-green-400/10 border-green-400/20"
                    : inv.status === "failed" ? "text-red-400 bg-red-400/10 border-red-400/20"
                    : "text-gray-400 bg-gray-400/10 border-gray-400/20"}`}>
                    {inv.status === "succeeded" ? "Bezahlt" : inv.status === "failed" ? "Fehlgeschlagen" : inv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {new Date(inv.paid_at ?? inv.created_at).toLocaleDateString("de-CH")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-700">
        Rechnungen werden 10 Jahre aufbewahrt (OR Art. 958f). Bei Fragen: support@baddi.ch
      </p>
    </section>
  );
}
