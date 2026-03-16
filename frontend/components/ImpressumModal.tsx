"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/config";

interface ImpressumModalProps {
  onClose: () => void;
}

interface ImpressumData {
  firma: string;
  strasse: string;
  plz_ort: string;
  vertreten_durch: string;
  funktion: string;
  telefon: string;
  email: string;
  handelsregister: string;
  registernummer: string;
  mwst: string;
}

const DEFAULTS: ImpressumData = {
  firma: "AI Buddy GmbH",
  strasse: "Musterstraße 1",
  plz_ort: "3000 Bern, Schweiz",
  vertreten_durch: "Max Mustermann",
  funktion: "Geschäftsführer",
  telefon: "+41 00 000 00 00",
  email: "info@ai-buddy.ch",
  handelsregister: "Handelsregister des Kantons Bern",
  registernummer: "CHE-000.000.000",
  mwst: "CHE-000.000.000 MWST",
};

const CACHE_KEY = "impressum_settings_cache";

export default function ImpressumModal({ onClose }: ImpressumModalProps) {
  const [data, setData] = useState<ImpressumData>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? { ...DEFAULTS, ...JSON.parse(cached) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  useEffect(() => {
    fetch(`${BACKEND_URL}/v1/settings/impressum`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setData({ ...DEFAULTS, ...d });
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="impressum-title"
    >
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 id="impressum-title" className="text-xl font-bold text-white">Impressum</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl leading-none" aria-label="Schließen">×</button>
        </div>

        <div className="px-6 py-6 space-y-6 text-sm text-gray-300 leading-relaxed">

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Angaben gemäß § 5 TMG / Art. 3 UWG</h3>
            <p className="font-medium text-gray-100">{data.firma}</p>
            <p>{data.strasse}</p>
            <p>{data.plz_ort}</p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Vertreten durch</h3>
            <p>{data.vertreten_durch} <span className="text-gray-500">({data.funktion})</span></p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Kontakt</h3>
            <p>Telefon: <a href={`tel:${data.telefon.replace(/\s/g, "")}`} className="text-blue-400 hover:text-blue-300">{data.telefon}</a></p>
            <p>E-Mail: <a href={`mailto:${data.email}`} className="text-blue-400 hover:text-blue-300">{data.email}</a></p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Registereintrag</h3>
            <p>Eintragung im {data.handelsregister}</p>
            <p>Registernummer: {data.registernummer}</p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Umsatzsteuer-Identifikationsnummer</h3>
            <p>Gemäß § 27 a UStG / Art. 28 MWSTG: <span className="text-gray-100 font-medium">{data.mwst}</span></p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Haftung für Inhalte</h3>
            <p>Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Haftung für Links</h3>
            <p>Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.</p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Urheberrecht</h3>
            <p>Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.</p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-2">Online-Streitbeilegung (EU-ODR)</h3>
            <p>
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                https://ec.europa.eu/consumers/odr
              </a>
              . Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </section>

          <section className="border-t border-gray-700 pt-4">
            <h3 className="text-base font-semibold text-white mb-2">Hinweis zum KI-Einsatz</h3>
            <p>Diese Plattform nutzt Künstliche Intelligenz (KI) zur Verarbeitung von Nutzeranfragen. Die KI-generierten Antworten ersetzen keine professionelle Beratung (rechtlich, medizinisch, finanziell o. ä.). Angaben ohne Gewähr.</p>
          </section>

        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 rounded-b-2xl">
          <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-2.5 rounded-xl font-semibold text-white text-sm">
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
