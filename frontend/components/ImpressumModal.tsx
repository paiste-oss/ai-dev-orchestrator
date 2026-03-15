"use client";

import { useEffect } from "react";

interface ImpressumModalProps {
  onClose: () => void;
}

/**
 * Rechtlich korrektes Impressum-Modal nach § 5 TMG (DE) / Art. 3 UWG (CH).
 * Pflichtangaben: Anbieter, Adresse, Kontakt, Vertretungsberechtigte,
 * Handelsregister, Umsatzsteuer-ID, Aufsichtsbehörde (falls zutreffend),
 * Haftungshinweise sowie Hinweis auf Online-Streitbeilegung (ODR).
 */
export default function ImpressumModal({ onClose }: ImpressumModalProps) {
  // Schließen mit Escape-Taste
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Body-Scroll sperren solange Modal offen
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="impressum-title"
    >
      {/* Modal-Fenster */}
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 id="impressum-title" className="text-xl font-bold text-white">
            Impressum
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
            aria-label="Impressum schließen"
          >
            ×
          </button>
        </div>

        {/* Inhalt */}
        <div className="px-6 py-6 space-y-6 text-sm text-gray-300 leading-relaxed">

          {/* ── Angaben gemäß § 5 TMG ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Angaben gemäß § 5 TMG / Art. 3 UWG
            </h3>
            <p className="font-medium text-gray-100">AI Buddy GmbH</p>
            <p>Musterstraße 1</p>
            <p>3000 Bern, Schweiz</p>
          </section>

          {/* ── Vertreten durch ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Vertreten durch
            </h3>
            <p>Max Mustermann <span className="text-gray-500">(Geschäftsführer)</span></p>
          </section>

          {/* ── Kontakt ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">Kontakt</h3>
            <p>
              Telefon:{" "}
              <a href="tel:+41000000000" className="text-blue-400 hover:text-blue-300 transition-colors">
                +41 00 000 00 00
              </a>
            </p>
            <p>
              E-Mail:{" "}
              <a href="mailto:info@ai-buddy.ch" className="text-blue-400 hover:text-blue-300 transition-colors">
                info@ai-buddy.ch
              </a>
            </p>
          </section>

          {/* ── Handelsregister ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Registereintrag
            </h3>
            <p>Eintragung im Handelsregister des Kantons Bern</p>
            <p>Registernummer: CHE-000.000.000</p>
          </section>

          {/* ── Umsatzsteuer ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Umsatzsteuer-Identifikationsnummer
            </h3>
            <p>
              Gemäß § 27 a UStG / Art. 28 MWSTG:{" "}
              <span className="text-gray-100 font-medium">CHE-000.000.000 MWST</span>
            </p>
          </section>

          {/* ── Haftung für Inhalte ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Haftung für Inhalte
            </h3>
            <p>
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte
              auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
              §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet,
              übermittelte oder gespeicherte fremde Informationen zu überwachen oder
              nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit
              hinweisen.
            </p>
            <p className="mt-2">
              Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
              Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
              Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der
              Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden
              von entsprechenden Rechtsverletzungen werden wir diese Inhalte
              umgehend entfernen.
            </p>
          </section>

          {/* ── Haftung für Links ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Haftung für Links
            </h3>
            <p>
              Unser Angebot enthält Links zu externen Websites Dritter, auf deren
              Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden
              Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten
              Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten
              verantwortlich.
            </p>
          </section>

          {/* ── Urheberrecht ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Urheberrecht
            </h3>
            <p>
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen
              Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung,
              Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der
              Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des
              jeweiligen Autors bzw. Erstellers.
            </p>
          </section>

          {/* ── Online-Streitbeilegung (ODR) ── */}
          <section>
            <h3 className="text-base font-semibold text-white mb-2">
              Online-Streitbeilegung (EU-ODR)
            </h3>
            <p>
              Die Europäische Kommission stellt eine Plattform zur
              Online-Streitbeilegung (OS) bereit:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                https://ec.europa.eu/consumers/odr
              </a>
              . Unsere E-Mail-Adresse finden Sie oben im Impressum. Wir sind nicht
              bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </section>

          {/* ── KI-Hinweis (spezifisch für KI-SaaS) ── */}
          <section className="border-t border-gray-700 pt-4">
            <h3 className="text-base font-semibold text-white mb-2">
              Hinweis zum KI-Einsatz
            </h3>
            <p>
              Diese Plattform nutzt Künstliche Intelligenz (KI) zur
              Verarbeitung von Nutzeranfragen. Die KI-generierten Antworten
              ersetzen keine professionelle Beratung (rechtlich, medizinisch,
              finanziell o. ä.). Angaben ohne Gewähr. Nutzer tragen die
              Verantwortung für die Überprüfung und Verwendung der Ausgaben.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 px-6 py-4 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-2.5 rounded-xl font-semibold text-white text-sm"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
