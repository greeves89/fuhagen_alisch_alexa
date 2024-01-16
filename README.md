# Nutzerhandbuch Alexa_Skill Fernuni Hagen

 -------------------------------------------
1. Einführung

Das Skript index.js integriert verschiedene Dienste wie Google Gmail, Google Tasks, Google Calendar und OpenAI GPT-3 in einen Alexa Skill. Es ermöglicht die Verwaltung von E-Mails, Aufgaben und Terminen sowie die Interaktion mit GPT-3 über Alexa.

 1.2. Vorbereitung
 Stellen Sie sicher, dass Node.js und npm installiert sind.
 Installieren Sie die benötigten Pakete: ask-sdk-core, googleapis, nodemailer, moment-timezone, openai und aws-sdk.
 1.3. Konfiguration
 Setzen Sie den OpenAI API-Schlüssel und die AWS-Region.
 Konfigurieren Sie den OAuth2-Client für Google-Dienste.
 1.4. Hauptfunktionen
 LaunchRequestHandler: Startet den Skill und überprüft die Verfügbarkeit von Tokens.
 SummarizeMailIntentHandler: Fasst E-Mails zusammen und interagiert mit GPT-3.
 SummarizeDayIntentHandler: Gibt eine Zusammenfassung des Tages aus, einschließlich Aufgaben, E-Mails und Terminen.
 AddTaskIntentHandler: Fügt eine Aufgabe zum Google Kalender hinzu.
 ListTasksIntentHandler: Listet Aufgaben aus Google Tasks auf.
 ReadTaskIntentHandler: Liest Details einer bestimmten Aufgabe vor.
 DeleteTaskIntentHandler: Löscht eine Aufgabe aus Google Tasks.
 handleConversationWithGPT: Ermöglicht eine Konversation mit GPT-3.
 1.5. Interaktion mit E-Mails
 ReadEmailIntentHandler: Liest E-Mails vor.
 NextEmailIntentHandler: Wechselt zur nächsten E-Mail.
 DeleteEmailIntentHandler: Löscht eine E-Mail.
 1.6. Zusätzliche Funktionen
 MarkMailAsReadedHandler: Markiert eine E-Mail als gelesen.
 remindMeIntentHandler: Erstellt eine Erinner

2. Erste Schritte

3. Verwendung des Skills

4. Entwicklung und Anpassung

5. Fehlerbehebung

6. Mitwirken

7. Kontakt
