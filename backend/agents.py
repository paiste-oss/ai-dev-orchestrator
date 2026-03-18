import httpx
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from anthropic import Anthropic
from tools import FolderSensorTool, GitHubUploadTool
from core.config import settings


def detect_language_simple(text: str) -> str:
    german_chars = set("äöüÄÖÜß")
    german_words = {"ich", "du", "ist", "bitte", "danke", "wie", "was", "wo", "wer", "und", "oder", "nicht", "das", "die", "der"}
    words = set(text.lower().split())
    if any(c in text for c in german_chars) or len(words & german_words) >= 1:
        return "de"
    return "en"


def get_language_system_prompt(prompt_text: str) -> str:
    lang = detect_language_simple(prompt_text)
    hints = {
        "de": "Antworte ausschließlich auf Deutsch. Keine andere Sprache.",
        "en": "Reply exclusively in English. No other language.",
    }
    return hints.get(lang, hints["en"])


def execute_ollama_direct(prompt_text: str, model_name: str = None, system_prompt: str = None) -> str:
    """Direkte Ollama-Anfrage ohne Agent-Overhead — für einfache Prompts."""
    model = model_name or settings.ollama_chat_model
    sys_prompt = system_prompt if system_prompt else get_language_system_prompt(prompt_text)
    response = httpx.post(
        f"{settings.ollama_base_url}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": prompt_text}
            ],
            "stream": False
        },
        timeout=120
    )
    response.raise_for_status()
    return response.json()["message"]["content"]


def execute_agent_with_tools(prompt_text: str, model_name: str = None) -> str:
    """CrewAI Agent mit Folder Sensor und GitHub Upload — für Code/Projektaufgaben."""
    model = model_name or settings.ollama_code_model
    local_llm = ChatOpenAI(
        model=model,
        api_key="NA",
        base_url=f"{settings.ollama_base_url}/v1"
    )

    agent = Agent(
        role='Senior System Architect',
        goal='Analysiere das Projekt und führe Code-Aufgaben präzise aus.',
        backstory='Du bist ein erfahrener Entwickler mit Zugriff auf den Projektordner. Antworte immer in der Sprache des Nutzers.',
        llm=local_llm,
        tools=[FolderSensorTool(), GitHubUploadTool()],
        verbose=True,
        allow_delegation=False
    )

    task = Task(
        description=prompt_text,
        expected_output='Eine saubere Antwort in der Sprache des Nutzers, ohne technische Protokolle oder JSON-Strukturen.',
        agent=agent
    )

    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential)
    return str(crew.kickoff())


def execute_claude_task(prompt_text: str, model_name: str = "claude-sonnet-4-6") -> str:
    """Anthropic Claude API — für komplexe Aufgaben."""
    client = Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=model_name,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt_text}],
        system=get_language_system_prompt(prompt_text)
    )
    return message.content[0].text


