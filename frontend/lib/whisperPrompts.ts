/**
 * Whisper initial_prompt — kontextabhängig pro Sprache.
 * Biased die Tokenisierung auf das richtige Vokabular und die richtige Interpunktion.
 */

type Mode = "chat" | "dictation";

const CHAT_PROMPTS: Record<string, string> = {
  de:  "Schweizerdeutsch oder Hochdeutsch. Kurze Sätze, Fragen und Anweisungen. KI-Assistent.",
  gsw: "Schweizerdeutsch oder Hochdeutsch. Kurze Sätze, Fragen und Anweisungen. KI-Assistent.",
  en:  "English. Short sentences, questions and instructions. AI assistant.",
  fr:  "Français. Phrases courtes, questions et instructions. Assistant IA.",
  it:  "Italiano. Frasi brevi, domande e istruzioni. Assistente IA.",
  es:  "Español. Frases cortas, preguntas e instrucciones. Asistente de IA.",
  pt:  "Português. Frases curtas, perguntas e instruções. Assistente de IA.",
  nl:  "Nederlands. Korte zinnen, vragen en instructies. AI-assistent.",
  pl:  "Polski. Krótkie zdania, pytania i polecenia. Asystent AI.",
  tr:  "Türkçe. Kısa cümleler, sorular ve talimatlar. Yapay zeka asistanı.",
};

const DICTATION_PROMPTS: Record<string, string> = {
  de:  "Professionelles Diktat auf Hochdeutsch. Vollständige Sätze mit Zeichensetzung. Geschäftsbriefe, Notizen und Berichte.",
  gsw: "Professionelles Diktat auf Hochdeutsch. Vollständige Sätze mit Zeichensetzung. Geschäftsbriefe, Notizen und Berichte.",
  en:  "Professional dictation in English. Complete sentences with punctuation. Business letters, notes and reports.",
  fr:  "Dictée professionnelle en français. Phrases complètes avec ponctuation. Lettres commerciales, notes et rapports.",
  it:  "Dettatura professionale in italiano. Frasi complete con punteggiatura. Lettere commerciali, note e relazioni.",
  es:  "Dictado profesional en español. Oraciones completas con puntuación. Cartas comerciales, notas e informes.",
  pt:  "Ditado profissional em português. Frases completas com pontuação. Cartas comerciais, notas e relatórios.",
  nl:  "Professioneel dicteren in het Nederlands. Volledige zinnen met interpunctie. Zakelijke brieven, notities en rapporten.",
  pl:  "Profesjonalne dyktando po polsku. Pełne zdania z interpunkcją. Listy biznesowe, notatki i raporty.",
  tr:  "Türkçe profesyonel dikte. Noktalama işaretli tam cümleler. İş mektupları, notlar ve raporlar.",
};

/** Liefert den passenden Whisper-Prompt für die Benutzersprache und den Kontext. */
export function getWhisperPrompt(language: string | undefined, mode: Mode): string {
  const lang = language ?? "de";
  const map = mode === "chat" ? CHAT_PROMPTS : DICTATION_PROMPTS;
  return map[lang] ?? map["en"]!;
}
