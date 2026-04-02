import Link from "next/link";

export const metadata = {
  title: "AGB – Baddi",
  description: "Allgemeine Geschäftsbedingungen für die Nutzung von Baddi",
};

export default function AGBPage() {
  return (
    <div className="min-h-screen bg-[#030712] text-gray-200">
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm mb-6 inline-block">
            ← Zurück zu Baddi
          </Link>
          <h1 className="text-3xl font-bold text-white mt-4">Allgemeine Geschäftsbedingungen</h1>
          <p className="text-gray-400 mt-2">Stand: April 2026</p>
        </div>

        <div className="prose prose-invert prose-indigo max-w-none space-y-10 text-gray-300 leading-relaxed">

          <Section title="1. Anbieter und Geltungsbereich">
            <p>Diese AGB gelten für die Nutzung des KI-Assistenten <strong>Baddi</strong> unter baddi.ch (nachfolgend «Dienst»), angeboten von [Firmenname], [Adresse], Schweiz (nachfolgend «Anbieter»).</p>
            <p>Mit der Registrierung akzeptiert der Nutzer diese AGB vollumfänglich. Abweichende Bedingungen des Nutzers werden nicht anerkannt.</p>
            <p>Der Dienst richtet sich an Unternehmen, Gewerbetreibende sowie Privatpersonen.</p>
          </Section>

          <Section title="2. Leistungsumfang">
            <p>Baddi stellt einen KI-gestützten Assistenten bereit, der auf Basis von Large Language Models (LLM) Texte generiert, Fragen beantwortet und Aufgaben unterstützt.</p>
            <p>Der Anbieter schuldet eine Verfügbarkeit von 99 % im Jahresdurchschnitt, ausgenommen geplante Wartungsarbeiten und Ausfälle bei Drittanbietern (insb. AWS, Anthropic).</p>
            <p>Der Anbieter behält sich vor, den Funktionsumfang jederzeit zu erweitern, einzuschränken oder anzupassen. Wesentliche Einschränkungen werden dem Nutzer mindestens 30 Tage im Voraus mitgeteilt.</p>
            <Highlight>
              <strong>KI-generierte Inhalte:</strong> Alle vom Dienst generierten Inhalte sind maschinell erstellt und können fehlerhaft, unvollständig oder veraltet sein. Der Nutzer ist verpflichtet, die Inhalte vor jeder geschäftlichen Verwendung selbstständig zu prüfen. Der Anbieter übernimmt keine Haftung für Entscheidungen, die auf KI-generierten Inhalten basieren.
            </Highlight>
          </Section>

          <Section title="3. Registrierung und Nutzerkonto">
            <p>Die Registrierung erfordert eine gültige E-Mail-Adresse und wahrheitsgemässe Angaben.</p>
            <p>Der Nutzer ist für die Sicherheit seiner Zugangsdaten selbst verantwortlich. Bei Verdacht auf unbefugten Zugriff ist der Anbieter unverzüglich zu informieren.</p>
            <p>Pro Unternehmen ist grundsätzlich ein Konto zulässig. Mehrfachkonten zur Umgehung von Tariflimits sind untersagt.</p>
          </Section>

          <Section title="4. Preise und Zahlungsbedingungen">
            <p>Die aktuellen Preise sind unter baddi.ch/preise einsehbar. Alle Preise verstehen sich in Schweizer Franken (CHF) exkl. MwSt., sofern nicht anders angegeben.</p>
            <p>Abonnements werden monatlich im Voraus abgerechnet und verlängern sich automatisch, sofern nicht rechtzeitig gekündigt wird.</p>
            <p>Die Zahlungsabwicklung erfolgt über Stripe Inc. Es gelten ergänzend die Nutzungsbedingungen von Stripe.</p>
            <p>Bei Zahlungsverzug behält sich der Anbieter vor, den Zugang zum Dienst zu sperren. Bereits bezahlte Beträge werden nicht erstattet.</p>
            <p>Preisanpassungen werden dem Nutzer mindestens 30 Tage vor Inkrafttreten per E-Mail mitgeteilt. Widerspricht der Nutzer nicht innerhalb von 14 Tagen, gilt die Preisanpassung als akzeptiert.</p>
          </Section>

          <Section title="5. Nutzerpflichten und verbotene Nutzung">
            <p>Der Nutzer verpflichtet sich, den Dienst nicht für folgende Zwecke zu verwenden:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Erstellung von rechtswidrigen, diskriminierenden, täuschenden oder schädlichen Inhalten</li>
              <li>Spam, Phishing oder andere missbräuchliche Kommunikation</li>
              <li>Verletzung von Rechten Dritter (Urheberrecht, Datenschutz, Persönlichkeitsrechte)</li>
              <li>Reverse Engineering oder Extraktion von Modelldaten</li>
              <li>Automatisierter Massenabruf ohne ausdrückliche schriftliche Genehmigung</li>
            </ul>
            <p className="mt-3">Der Nutzer trägt die volle Verantwortung für alle über sein Konto generierten Inhalte und deren Verwendung.</p>
            <p>Bei Verstoss gegen diese Pflichten ist der Anbieter berechtigt, das Konto ohne Vorankündigung zu sperren oder zu kündigen.</p>
          </Section>

          <Section title="6. Datenschutz und Datensicherheit">
            <p>Der Anbieter verarbeitet Personendaten gemäss dem Schweizer Datenschutzgesetz (DSG) sowie der EU-Datenschutz-Grundverordnung (DSGVO), soweit anwendbar. Die <Link href="/datenschutz" className="text-indigo-400 hover:text-indigo-300 underline">Datenschutzerklärung</Link> ist integraler Bestandteil dieser AGB.</p>
            <p>Chat-Inhalte werden zur Erbringung und Personalisierung des Dienstes verarbeitet. Eine Weitergabe an Dritte erfolgt nur soweit dies für die Leistungserbringung notwendig ist (insb. AWS Bedrock, Anthropic).</p>
            <p>Die Verarbeitung erfolgt auf Servern innerhalb der Europäischen Union (AWS eu-central-1).</p>
            <p>Der Nutzer ist dafür verantwortlich, dass er die erforderlichen Rechte und Einwilligungen besitzt für alle Daten, die er in den Dienst eingibt — insbesondere bei Personendaten Dritter.</p>
          </Section>

          <Section title="7. Gespeicherte Zugangsdaten (Tresor-Funktion)">
            <p className="text-gray-400 text-sm italic">Dieser Abschnitt gilt, sofern die Tresor-Funktion vom Anbieter bereitgestellt wird.</p>
            <p>Der Nutzer kann Zugangsdaten und vertrauliche Informationen im verschlüsselten Tresor hinterlegen. Diese werden serverseitig mit AES-256 verschlüsselt gespeichert.</p>
            <p>Der Tresor dient ausschliesslich als persönliches Hilfsmittel des Nutzers. Der Anbieter übernimmt keine Verantwortung für Vollständigkeit, Richtigkeit oder Aktualität der hinterlegten Daten.</p>
            <Highlight>
              <strong>Hinweis:</strong> Der Anbieter haftet nicht für Schäden durch unbefugten Zugriff Dritter auf im Tresor gespeicherte Daten, sofern der Anbieter die nach dem Stand der Technik zumutbaren Sicherheitsmassnahmen ergriffen hat. Besonders kritische Zugangsdaten (z. B. Bankzugänge) sollten in einem dedizierten, zertifizierten Passwort-Manager verwaltet werden.
            </Highlight>
          </Section>

          <Section title="8. Geistiges Eigentum">
            <p>Alle Rechte am Dienst, der Software und der Benutzeroberfläche liegen beim Anbieter.</p>
            <p>Die vom Nutzer eingegebenen Inhalte verbleiben im Eigentum des Nutzers. Der Nutzer räumt dem Anbieter das Recht ein, diese Inhalte für die Erbringung und Verbesserung des Dienstes zu verarbeiten.</p>
            <p>Der Nutzer erhält das nicht-exklusive Recht zur Nutzung der KI-generierten Inhalte für eigene geschäftliche Zwecke. Eine Weiterveräusserung als eigenes KI-Produkt ist nicht gestattet.</p>
          </Section>

          <Section title="9. Haftungsbeschränkung">
            <p>Der Anbieter haftet nur für Schäden, die auf vorsätzlichem oder grobfahrlässigem Verhalten beruhen.</p>
            <p>Für mittelbare Schäden, entgangenen Gewinn oder Datenverlust wird die Haftung — soweit gesetzlich zulässig — ausgeschlossen.</p>
            <p>Die Gesamthaftung des Anbieters ist auf den vom Nutzer in den letzten 12 Monaten bezahlten Betrag beschränkt.</p>
          </Section>

          <Section title="10. Vertragsdauer und Kündigung">
            <p>Der Vertrag läuft auf unbestimmte Zeit und kann vom Nutzer jederzeit zum Ende des laufenden Abrechnungsmonats gekündigt werden.</p>
            <p>Der Anbieter kann den Vertrag mit einer Frist von 30 Tagen kündigen. Bei schwerwiegenden Verstössen gegen diese AGB ist eine fristlose Kündigung möglich.</p>
            <p>Nach Kündigung werden die Nutzerdaten innerhalb von 90 Tagen unwiderruflich gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>
          </Section>

          <Section title="11. Änderungen der AGB">
            <p>Der Anbieter behält sich vor, diese AGB jederzeit anzupassen. Änderungen werden dem Nutzer mindestens 14 Tage vor Inkrafttreten per E-Mail mitgeteilt.</p>
            <p>Widerspricht der Nutzer den Änderungen nicht innerhalb von 14 Tagen nach Zustellung, gelten sie als akzeptiert. Auf dieses Recht wird in der Mitteilung ausdrücklich hingewiesen.</p>
          </Section>

          <Section title="12. Anwendbares Recht und Gerichtsstand">
            <p>Diese AGB sowie die gesamte Vertragsbeziehung unterliegen dem Schweizer Recht, unter Ausschluss des UN-Kaufrechts (CISG).</p>
            <p>Gerichtsstand für Streitigkeiten ist [Kanton], vorbehaltlich zwingender gesetzlicher Vorschriften.</p>
          </Section>

        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-white/10 text-sm text-gray-500 flex flex-wrap gap-4">
          <Link href="/datenschutz" className="hover:text-gray-300">Datenschutzerklärung</Link>
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

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg px-4 py-3 text-sm text-gray-300 mt-3">
      {children}
    </div>
  );
}
