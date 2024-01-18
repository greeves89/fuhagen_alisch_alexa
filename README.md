# Installationsanleitung und Handbuch Alexa_Skill Fernuni Hagen
 -------------------------------------------
1. Einführung

    Der Alexa Skill integriert verschiedene Dienste wie Google Gmail, Google Tasks, Google Calendar und OpenAI GPT zu einer Sammlung von Funktionen. Er ermöglicht die Verwaltung von E-Mails, Aufgaben und Terminen sowie die Interaktion mit GPT-3 über Alexa.
 
2. Erste Schritte

    Vorbereitung

       Damit der Skill genutzt werden kann, müssen die folgenden Schritte ausgeführt werden:
       - Erstellen Sie ein Google Developer Account -> https://console.cloud.google.com
       - Erstellen Sie einen OPENAI API Account -> https://platform.openai.com/api-keys
       - [Optional, falls bereits ein Account besteht] Erstellen Sie einen Alexa Developer Account 
         -> https://developer.amazon.com/
  
    Konfiguration
   
       - Einrichten der GOOGLE API, siehe Installationshandbuch.pdf
       - Einrichten der OPEN AI API, siehe Installationshandbuch.pdf
       - Erstellen des Alexa Skill, siehe Installationshandbuch.pdf
        - Grundeinstellungen
        - Account Linking
        - Coding Anpassung
   
3. Verwendung des Skills
   
    Hauptfunktionen des Skills
   
       Start des Skills mittels "Alexa, starte [Skill Name]". Wichtig, die App kann nur mit dem gleichen Amazon Account
       verwendet werden, der auch den Skill erstellt hat. Es gibt jedoch die Möglichkeit einen Betatest zu starten
       um andere Nutzer zum Testen einzuladen.
   
       Die folgenden Funktionalitäten wurden im Interaktionsmodell des Skills hinterlegt:
   
       - Mailverwaltung:
         - "Liste meine Mails von heute auf." - Listet die heutigen Mails auf
         - "Schreibe eine Mail" - Interaktion zum Schreiben einer Mail gestartet
           - Wichtig, E-Mailadressen können fehlerhaft sein. Die konkrete Logik damit Alexa Mailadressen erkennt ist nicht 
             existent, daher wird dazu geraten mit dem Skill auf Mails zu antworten!
         - interaktion mit einer Mail:
           - "Vorlesen" - Mailbody wird vorgelesen. Auch technische Informationen
           - "Antworten" - Antwort wird durch das Gesprochene übernommen
           - "smartreply" - Antwort der Mail wird durch GPT erstellt
           - "zusammenfassen" - Mailbody wird durch GPT zusammengefasst. Hinweis auf mögliche Termine kommt.
           - "als gelesen markieren" - Mail wird als gelesen markiert
           - "löschen" - die Mail wird mit einer Rückfrage gelöscht
           - "nächste Mail" - wechselt zur nächsten Mail

       - Terminverwaltung
         - Auflisten von Terminen - "Liste meine Termine auf"

       - Aufgabenverwaltung
         - "Liste meine Aufgaben auf" - Es werden alle offnen Aufgaben erstellt
         - "Erstelle eine Aufgabe" - Interaktionsmodell zur Erstellung einer Aufgabe gestartet
         - interaktion mit einer Aufgabe:
           - "Mehr Infos" - liest die Beschreibung/Details der Aufgabe vor
           - "löschen" - löscht die Aufgabe
           - nächste Aufgabe - wechselt zur nächsten Aufgabe

       - Diskussion mit OpenAI GPT
         - "chat [Nachricht an GPT]" - Start eines Gesprächs mit ChatGPT

       - weitere Funktionalitäten:
         - "Fasse meinen Tag zusammen" - Es wird eine Zusammenfassung des Tages erstellt. Wieviele Mail,
           Termine und Aufgaben sind für heute geplant
         - "Hilfe" - gibt eine kurze Einführung in die Kommandos der Skills

5. Fehlerbehebung

Bitte Fehler hier kommentieren.

7. Kontakt

Bitte hier in GItHub kontaktieren.
