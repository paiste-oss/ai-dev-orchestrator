import Link from "next/link";
import BackButton from "@/components/BackButton";

export const metadata = {
  title: "Datenschutz – Baddi",
  description: "Datenschutzerklärung für die Nutzung von Baddi",
};

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-[#030712] text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-12">
          <BackButton />
          <h1 className="text-3xl font-bold text-white mt-4">Datenschutzerklärung</h1>
          <p className="text-gray-400 mt-2">Stand: April 2026 · Gemäss DSG (Schweiz) und DSGVO (EU)</p>
        </div>

        <div className="space-y-10 text-gray-300 leading-relaxed">

          <Section title="1. Verantwortliche Stelle">
            <p>Verantwortlich für die Verarbeitung Ihrer Personendaten ist:</p>
            <div className="bg-white/5 rounded-lg px-4 py-3 mt-2 text-sm space-y-1">
              <p><strong>[Firmenname]</strong></p>
              <p>[Strasse, PLZ Ort]</p>
              <p>Schweiz</p>
              <p>E-Mail: <a href="mailto:datenschutz@baddi.ch" className="text-indigo-400 hover:text-indigo-300">datenschutz@baddi.ch</a></p>
            </div>
          </Section>

          <Section title="2. Welche Daten wir erheben">
            <p>Wir erheben folgende Personendaten:</p>
            <table className="w-full mt-3 text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-left py-2 pr-4">Datenkategorie</th>
                  <th className="text-left py-2 pr-4">Zweck</th>
                  <th className="text-left py-2">Rechtsgrundlage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  ["Name, E-Mail", "Konto, Kommunikation", "Vertragserfüllung"],
                  ["Chat-Inhalte", "KI-Assistenz, Personalisierung", "Vertragserfüllung"],
                  ["Zahlungsdaten", "Abrechnung (via Stripe)", "Vertragserfüllung"],
                  ["Nutzungsstatistiken", "Verbesserung des Dienstes", "Berechtigtes Interesse"],
                  ["IP-Adresse, Browser", "Sicherheit, Fehlerdiagnose", "Berechtigtes Interesse"],
                ].map(([cat, zweck, grund]) => (
                  <tr key={cat}>
                    <td className="py-2 pr-4 text-gray-200">{cat}</td>
                    <td className="py-2 pr-4 text-gray-400">{zweck}</td>
                    <td className="py-2 text-gray-400">{grund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="3. Drittanbieter und Datenübermittlung">
            <p>Zur Erbringung des Dienstes arbeiten wir mit folgenden Drittanbietern zusammen:</p>
            <div className="mt-3 space-y-3">
              {[
                {
                  name: "AWS (Amazon Web Services)",
                  detail: "Hosting und KI-Verarbeitung via AWS Bedrock. Datenhaltung ausschliesslich in der EU (Region eu-central-1, Frankfurt).",
                  link: "https://aws.amazon.com/privacy/",
                },
                {
                  name: "Anthropic",
                  detail: "KI-Modelle (Claude). Anfragen werden über AWS Bedrock (EU) verarbeitet.",
                  link: "https://www.anthropic.com/privacy",
                },
                {
                  name: "Stripe Inc.",
                  detail: "Zahlungsabwicklung. Kreditkartendaten werden ausschliesslich von Stripe verarbeitet und nie auf unseren Servern gespeichert.",
                  link: "https://stripe.com/privacy",
                },
                {
                  name: "Brevo (ehemals Sendinblue)",
                  detail: "E-Mail-Versand (transaktionale E-Mails wie Bestätigungen, Rechnungen).",
                  link: "https://www.brevo.com/legal/privacypolicy/",
                },
              ].map(({ name, detail, link }) => (
                <div key={name} className="bg-white/5 rounded-lg px-4 py-3 text-sm">
                  <p className="font-medium text-white">{name}</p>
                  <p className="text-gray-400 mt-1">{detail}</p>
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 text-xs mt-1 inline-block">
                    Datenschutzerklärung →
                  </a>
                </div>
              ))}
            </div>
          </Section>

          <Section title="4. Speicherdauer">
            <p>Wir speichern Personendaten nur so lange, wie es für den jeweiligen Zweck notwendig ist:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
              <li>Kontodaten: bis zur Kündigung + 90 Tage</li>
              <li>Chat-Verläufe: bis zur Kündigung oder auf Anfrage</li>
              <li>Zahlungsdaten: 10 Jahre (gesetzliche Aufbewahrungspflicht)</li>
              <li>Server-Logs: max. 30 Tage</li>
            </ul>
          </Section>

          <Section title="5. Ihre Rechte">
            <p>Sie haben folgende Rechte bezüglich Ihrer Personendaten:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {[
                ["Auskunft", "Welche Daten wir über Sie gespeichert haben"],
                ["Berichtigung", "Korrektur unrichtiger Daten"],
                ["Löschung", "Löschung Ihrer Daten («Recht auf Vergessenwerden»)"],
                ["Einschränkung", "Einschränkung der Verarbeitung"],
                ["Datenübertragbarkeit", "Ihre Daten in maschinenlesbarem Format erhalten"],
                ["Widerspruch", "Widerspruch gegen bestimmte Verarbeitungen"],
              ].map(([recht, beschreibung]) => (
                <div key={recht} className="bg-white/5 rounded-lg px-3 py-2 text-sm">
                  <p className="font-medium text-white">{recht}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{beschreibung}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              Zur Ausübung Ihrer Rechte wenden Sie sich an:{" "}
              <a href="mailto:datenschutz@baddi.ch" className="text-indigo-400 hover:text-indigo-300">
                datenschutz@baddi.ch
              </a>
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Sie haben ausserdem das Recht, sich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) zu beschweren:{" "}
              <a href="https://www.edoeb.admin.ch" target="_blank" rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300">
                edoeb.admin.ch
              </a>
            </p>
          </Section>

          <Section title="6. Cookies und Tracking">
            <p>Wir verwenden ausschliesslich technisch notwendige Cookies für den Betrieb des Dienstes (Session-Management, Authentifizierung). Es werden keine Tracking- oder Werbe-Cookies eingesetzt.</p>
          </Section>

          <Section title="7. Sicherheit">
            <p>Wir setzen technische und organisatorische Massnahmen zum Schutz Ihrer Daten ein, darunter:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
              <li>Verschlüsselung der Datenübertragung via TLS/HTTPS</li>
              <li>Verschlüsselung sensibler Daten at rest (AES-256)</li>
              <li>Zugriffskontrolle und Authentifizierung</li>
              <li>Regelmässige Sicherheitsupdates</li>
            </ul>
          </Section>

          <Section title="8. Änderungen dieser Erklärung">
            <p>Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen. Die aktuelle Version ist stets unter baddi.ch/datenschutz verfügbar. Bei wesentlichen Änderungen werden registrierte Nutzer per E-Mail informiert.</p>
          </Section>

        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/10 text-sm text-gray-500 flex flex-wrap gap-4">
          <Link href="/agb" className="hover:text-gray-300">AGB</Link>
          <Link href="/login" className="hover:text-gray-300">Anmelden</Link>
          <Link href="/register" className="hover:text-gray-300">Registrieren</Link>
        </div>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-3 pb-2 border-b border-white/10">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
