/**
 * Whisper initial_prompt — kontextabhängig pro Sprache.
 * Biased die Tokenisierung auf das richtige Vokabular und die richtige Interpunktion.
 */

type Mode = "chat" | "dictation";

const CHAT_PROMPTS: Record<string, string> = {
  de:  "Sprachnachricht im Chat mit Baddi, einem KI-Assistenten. Schweizerdeutsch oder Hochdeutsch. Kurze Sätze, Fragen und Anweisungen.",
  gsw: "Sprachnachricht im Chat mit Baddi, einem KI-Assistenten. Schweizerdeutsch oder Hochdeutsch. Kurze Sätze, Fragen und Anweisungen.",
  en:  "Voice message in a chat with Baddi, an AI assistant. Short sentences, questions and instructions.",
  fr:  "Message vocal dans un chat avec Baddi, un assistant IA. Phrases courtes, questions et instructions.",
  it:  "Messaggio vocale in una chat con Baddi, un assistente IA. Frasi brevi, domande e istruzioni.",
  es:  "Mensaje de voz en un chat con Baddi, un asistente de IA. Frases cortas, preguntas e instrucciones.",
  pt:  "Mensagem de voz num chat com Baddi, um assistente de IA. Frases curtas, perguntas e instruções.",
  nl:  "Spraakbericht in een chat met Baddi, een AI-assistent. Korte zinnen, vragen en instructies.",
  pl:  "Wiadomość głosowa na czacie z Baddi, asystentem AI. Krótkie zdania, pytania i polecenia.",
  tr:  "Baddi adlı yapay zeka asistanıyla yapılan sohbette sesli mesaj. Kısa cümleler, sorular ve talimatlar.",
};

const DICTATION_PROMPTS: Record<string, string> = {
  de:  "Diktiergerät-Aufnahme auf Hochdeutsch. Gesprochener Text wird transkribiert. Vollständige Sätze mit Zeichensetzung. Geschäftsbriefe, Notizen und Berichte.",
  gsw: "Diktiergerät-Aufnahme auf Schweizerdeutsch oder Hochdeutsch. Gesprochener Text wird transkribiert, z.B. Gespräche, Sprechstunden oder Notizen. Vollständige Sätze mit Zeichensetzung.",
  en:  "Dictaphone recording in English. Spoken text is being transcribed. Complete sentences with punctuation. Business letters, notes and reports.",
  fr:  "Enregistrement dictaphone en français. Texte parlé en cours de transcription. Phrases complètes avec ponctuation. Lettres commerciales, notes et rapports.",
  it:  "Registrazione dittafono in italiano. Testo parlato in fase di trascrizione. Frasi complete con punteggiatura. Lettere commerciali, note e relazioni.",
  es:  "Grabación de dictáfono en español. Texto hablado siendo transcrito. Oraciones completas con puntuación. Cartas comerciales, notas e informes.",
  pt:  "Gravação de ditafone em português. Texto falado a ser transcrito. Frases completas com pontuação. Cartas comerciais, notas e relatórios.",
  nl:  "Dictafoonopname in het Nederlands. Gesproken tekst wordt getranscribeerd. Volledige zinnen met interpunctie. Zakelijke brieven, notities en rapporten.",
  pl:  "Nagranie dyktafonu po polsku. Mówiony tekst jest transkrybowany. Pełne zdania z interpunkcją. Listy biznesowe, notatki i raporty.",
  tr:  "Türkçe diktafon kaydı. Konuşulan metin transkribe ediliyor. Noktalama işaretli tam cümleler. İş mektupları, notlar ve raporlar.",
};

/** Liefert den passenden Whisper-Prompt für die Benutzersprache und den Kontext. */
export function getWhisperPrompt(language: string | undefined, mode: Mode): string {
  const lang = language ?? "de";
  const map = mode === "chat" ? CHAT_PROMPTS : DICTATION_PROMPTS;
  return map[lang] ?? map["en"]!;
}
