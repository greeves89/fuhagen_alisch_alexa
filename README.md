# Installationsanleitung und Handbuch Alexa_Skill Fernuni Hagen
 -------------------------------------------
1. Einführung

    Der Alexa Skill integriert verschiedene Dienste wie Google Gmail, Google Tasks, Google Calendar und OpenAI GPT zu einer Sammlung von Funktionen. Er ermöglicht die Verwaltung von E-Mails, Aufgaben und Terminen sowie die Interaktion mit GPT-3 über Alexa.
 
3. Erste Schritte

    Vorbereitung

       Damit der Skill genutzt werden kann, müssen die folgenden Schritte ausgeführt werden:
       - Erstellen Sie ein Google Developer Account -> https://console.cloud.google.com
       - Erstellen Sie einen OPENAI API Account -> https://platform.openai.com/api-keys
       - Erstellen Sie einen Alexa Developer Account -> https://developer.amazon.com/
  
    Konfiguration
   
       Setzen Sie den OpenAI API-Schlüssel und die AWS-Region.
       Konfigurieren Sie den OAuth2-Client für Google-Dienste.

4. Verwendung des Skills
    Hauptfunktionen des Skills
       Start des Skills mittels "Alexa, starte [Skill Name]".
   
       Die folgenden Funktionalitäten wurden im Interaktionsmodell des Skills hinterlegt:
   
       - Mailverwaltung:
         - Auflisten von Mails - "Liste meine Mails von heute auf."
         - Schreiben einer Mail - "Schreibe eine Mail"
         - interaktion mit einer Mail:
           - Vorlesen
           - Antworten
           - Zusammenfassen
           - als gelesen markieren
           - löschen
           - nächste Mail
       - Terminverwaltung
         - Auflisten von Terminen
       - Aufgabenverwaltung
         - Auflisten von Aufgaben
         - Erstellen einer Aufgabe
         - interaktion mit einer Aufgabe:
           - Mehr Infos
           - löschen
           - nächste Aufgabe
       - Diskussion mit OpenAI GPT
         - Start eines Gesprächs mit ChatGPT
       - weitere Funktionalitäten:
         - Zusammenfassung des Tages
         - Anleitung - "Hilfe"

6. Fehlerbehebung

7. Kontakt
  Bitte per Mail
