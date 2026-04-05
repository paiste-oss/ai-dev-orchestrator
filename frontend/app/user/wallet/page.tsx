"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, apiFetch } from "@/lib/auth";
import { BACKEND_URL } from "@/lib/config";
import WalletBalanceCard from "@/components/user/wallet/WalletBalanceCard";
import TopupModal from "@/components/user/wallet/TopupModal";
import WalletSettingsModal from "@/components/user/wallet/WalletSettingsModal";
import StorageAddons from "@/components/user/wallet/StorageAddons";
import InvoicesTable from "@/components/user/wallet/InvoicesTable";

interface WalletStatus {
  balance_chf: number;
  monthly_limit_chf: number;
  per_tx_limit_chf: number;
  monthly_spent_chf: number;
  monthly_remaining_chf: number;
  auto_topup_enabled: boolean;
  auto_topup_threshold_chf: number;
  auto_topup_amount_chf: number;
  has_saved_card: boolean;
  has_active_subscription: boolean;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_extra_bytes: number;
  storage_addon_items: { key: string; bytes: number; added_at: string }[];
}

interface StorageAddon {
  key: string;
  label: string;
  bytes: number;
  price_chf: number;
  description: string;
}

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

function WalletPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [addons, setAddons] = useState<StorageAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!getSession()) { router.replace("/login"); return; }
    load();
    const s = searchParams.get("status");
    if (s === "topup_success") setAlert({ type: "success", text: "Zahlung erfolgreich! Dein Guthaben wird in Kürze gutgeschrieben." });
    if (s === "canceled")     setAlert({ type: "error",   text: "Zahlung abgebrochen." });
  }, []);


  async function load() {
    setLoading(true);
    try {
      const [wRes, iRes, aRes] = await Promise.all([
        apiFetch(`${BACKEND_URL}/v1/billing/wallet`),
        apiFetch(`${BACKEND_URL}/v1/billing/invoices`),
        apiFetch(`${BACKEND_URL}/v1/billing/storage/addons`),
      ]);
      if (wRes.ok) setWallet(await wRes.json());
      if (iRes.ok) setInvoices(await iRes.json());
      if (aRes.ok) setAddons(await aRes.json());
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/chat")} className="text-gray-500 hover:text-white text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold">Wallet</h1>
            <p className="text-xs text-gray-500">Guthaben, Limits & Transaktionen</p>
          </div>
        </div>

        {/* Alert nach Stripe-Rückleitung */}
        {alert && (
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
            alert.type === "success"
              ? "bg-green-500/10 border-green-500/30 text-green-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}>
            <span>{alert.text}</span>
            <button onClick={() => setAlert(null)} className="text-lg leading-none opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-600 py-16">Lade…</p>
        ) : wallet ? (
          <>
            <WalletBalanceCard wallet={wallet} onOpenSettings={() => setSettingsOpen(true)} />
            <TopupModal hasActiveSubscription={wallet.has_active_subscription} />
            <StorageAddons wallet={wallet} addons={addons} onAddonPurchased={load} />
            <InvoicesTable invoices={invoices} />
          </>
        ) : (
          <p className="text-center text-gray-600 py-16">Wallet nicht verfügbar.</p>
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && wallet && (
        <WalletSettingsModal
          wallet={wallet}
          onClose={() => setSettingsOpen(false)}
          onSaved={(updated) => setWallet(prev => prev ? { ...prev, ...updated } : prev)}
        />
      )}
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <WalletPageInner />
    </Suspense>
  );
}
