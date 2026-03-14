import os
import base64
import requests
from crewai.tools import BaseTool


class FolderSensorTool(BaseTool):
    name: str = "Folder Sensor"
    description: str = "Liest alle Dateien im Projektordner, um den aktuellen Stand des Codes zu verstehen."

    def _run(self) -> str:
        root_dir = ".."
        project_summary = ""
        ignore = ["node_modules", ".next", "__pycache__", ".git", "venv", "memory.db"]
        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in ignore]
            for file in files:
                if file.endswith(('.py', '.tsx', '.json', '.yml')):
                    file_path = os.path.join(root, file)
                    project_summary += f"\n--- DATEI: {file_path} ---\n"
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            project_summary += f.read()[:500]
                    except:
                        pass
        return project_summary


class GitHubUploadTool(BaseTool):
    name: str = "GitHub Code Uploader"
    description: str = "Lädt Code auf GitHub hoch."

    def _run(self, code: str, filename: str) -> str:
        token = os.getenv("GITHUB_TOKEN")
        repo_name = "paiste-oss/ai-dev-orchestrator"
        url = f"https://api.github.com/repos/{repo_name}/contents/{filename}"
        headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
        encoded_code = base64.b64encode(code.encode("utf-8")).decode("utf-8")
        data = {"message": f"KI-Upload: {filename}", "content": encoded_code}
        res = requests.put(url, headers=headers, json=data)
        return "Erfolg!" if res.status_code in [200, 201] else f"Fehler: {res.text}"
