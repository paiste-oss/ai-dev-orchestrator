"use client";

import { chf, formatDate } from "@/lib/wallet-utils";

interface Invoice {
  id: string;
  invoice_number: string | null;
  amount_chf: number;
  description: string;
  payment_type: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  topup: "Aufladung (Karte)",
  auto_topup: "Auto-Aufladung",
  bank_transfer: "Banküberweisung",
  wallet_debit: "Token-Overage",
  subscription: "Abo-Zahlung",
  storage_addon: "Speicher Add-on (monatlich)",
};

interface Props {
  invoices: Invoice[];
}

export default function InvoicesTable({ invoices }: Props) {
  if (invoices.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">Transaktionen</h2>
      </div>
      <div className="divide-y divide-gray-800/50">
        {invoices.slice(0, 20).map(inv => (
          <div key={inv.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm text-white">{inv.description}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {TYPE_LABEL[inv.payment_type] ?? inv.payment_type}
                {inv.invoice_number && <span className="ml-2 font-mono">{inv.invoice_number}</span>}
                <span className="ml-2">{formatDate(inv.created_at)}</span>
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${
                inv.payment_type === "wallet_debit" ? "text-red-400" : "text-green-400"
              }`}>
                {inv.payment_type === "wallet_debit" ? "−" : "+"}{chf(inv.amount_chf)}
              </p>
              <span className={`text-xs ${inv.status === "succeeded" ? "text-gray-600" : "text-yellow-500"}`}>
                {inv.status === "succeeded" ? "✓" : inv.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
