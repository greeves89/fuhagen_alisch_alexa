const Alexa = require('ask-sdk-core');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
const openai = require('openai');
const AWS = require('aws-sdk');

var userId = '';
var refreshToken = '';

process.env.OPENAI_API_KEY = 'ENTER_YOUR_API_KEY_HERE';

AWS.config.update({region: 'GER'}); // Ersetzen Sie REGION mit Ihrer Region
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const apiKey = process.env.OPENAI_API_KEY;

const openAI= new openai({
  apiKey: process.env.OPENAI_API_KEY // This is also the default, can be omitted
});

const oauth2Client = new google.auth.OAuth2();

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    // Speichern Sie das neue Refresh-Token in Ihrem sicheren Speicher
    console.log(`Neues Refresh-Token: ${tokens.refresh_token}`);
  }
  console.log(`Neues Zugriffstoken: ${tokens.access_token}`);
});

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle: async function(handlerInput) {
        console.log('Überprüfe Tokens.');
        const userId = handlerInput.requestEnvelope.context.System.user.userId;
        console.log(`userId: ${userId}`);

        let accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        console.log(`accessToken: ${accessToken}`);
        let refreshToken = handlerInput.requestEnvelope.context.System.user.refreshToken;
        console.log(`refreshToken: ${refreshToken}`);

        if (!accessToken && !refreshToken) {
            // Der Benutzer hat weder Access Token noch Refresh Token
            return handlerInput.responseBuilder
                .speak('Bitte verknüpfe deinen Account mit dem Skill über die Alexa App, nur so kannst du auf deine Mails, Termine und Aufgaben zugreifen. Ohne Verlinkung kannst du mit Chat GPT interagieren.')
                .withLinkAccountCard()
                .getResponse();
        } else if (!accessToken && refreshToken) {
            // Access Token fehlt, aber Refresh Token ist vorhanden
            try {
                oauth2Client.setCredentials({ refresh_token: refreshToken });
                const newTokenResponse = await oauth2Client.refreshAccessToken();
                accessToken = newTokenResponse.credentials.access_token;
                console.log('Access-Token erneuert:', accessToken);

                // Speichern des neuen Access-Tokens und des Refresh-Tokens (falls aktualisiert)
                // ...
            } catch (error) {
                console.error('Fehler beim Erneuern des Access-Tokens:', error);
                return handlerInput.responseBuilder
                    .speak('Es gab ein Problem bei der Aktualisierung Ihres Zugangs. Bitte versuchen Sie es später erneut.')
                    .getResponse();
            }
        }

        // Weiterer Code, wenn das Access Token vorhanden ist oder erfolgreich erneuert wurde
        const speakOutput = 'Willkommen bei smart office. Für eine kleine Auflistung einiger Befehle sage "Hilfe". Wie kann ich dir heute helfen?';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Falls doch Hilfe benötigst, sage Hilfe und ich nenne dir meine Funktionen.')
            .getResponse();
    }
};

const SummarizeMailIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'summarizeMail';
    },
    async handle(handlerInput) {
        var speakOutput = "";
        console.log(`speakOutput: ${speakOutput}`);
        
        const accessToken = handlerInput.attributesManager.getSessionAttributes().accessToken;
        const gmail = getGmailClient(accessToken);
        
        console.log('In handle');
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(`Session attributes: ${JSON.stringify(sessionAttributes)}`);
        const emails = sessionAttributes.emails;
        const currentIndex = sessionAttributes.currentIndex;
        if (!emails || currentIndex >= emails.length) {
            console.log('Keine E-Mails zu lesen oder Index ungültig');
            return handlerInput.responseBuilder
                .speak('Es gibt keine E-Mail zum Vorlesen.')
                .reprompt('Sage "Weiter", um die nächste E-Mail zu hören, oder frage mich nach etwas anderem.')
                .getResponse();
        }

        // E-Mail-Details holen
        const currentEmail = emails[currentIndex];
                
        console.log(`Aktuelle E-Mail: ${JSON.stringify(currentEmail)}`);

        // Überprüfen, ob der E-Mail-Text länger als 7500 Zeichen ist
        let emailBody = currentEmail.body;
        
        console.log("Kürze die Mail um Sonderzeichen");
        emailBody = emailBody.replace(/&auml;/g, "ä")
           .replace(/&ouml;/g, "ö")
           .replace(/&uuml;/g, "ü")
           .replace(/&Auml;/g, "Ä")
           .replace(/&Ouml;/g, "Ö")
           .replace(/&Uuml;/g, "Ü")
           .replace(/&szlig;/g, "ß");
        console.log("Umlaute ersetzt");
        emailBody = emailBody.replace('&zwnj;','');
        console.log("zwnj ersetzt");
        emailBody = emailBody.replace('&nbsp;','');
        console.log("nbsp ersetzt");
        emailBody = emailBody.replace('[image: Google]','');
        console.log("[image: Google] ersetzt");
        emailBody = emailBody.replace(/<[^>]*>/g, "");
        console.log("<*> ersetzt");
        emailBody = emailBody.replace(/([^{]+{[^}]*})+/g, "");
        emailBody = emailBody.replace('[','');
        console.log("[ ersetzt");
        emailBody = emailBody.replace(']','');
        console.log("] ersetzt");
        
        if (emailBody.length > 2000) {
            speakOutput = speakOutput+"Da der Text der Mail zu lang ist, habe ich diesen gekürzt. \n\n";
            emailBody = emailBody.substring(0, 2000) + '\n\n\n... E-Mail gekürzt. Der Text überschreitet das Maximum von 2000 Zeichen.';
        }
        
        console.log(`Prüfe auf Anhänge!`);
        if (currentEmail.hasAttachments) {
            console.log(`Anhänge vorhanden!`);
            speakOutput += "Diese E-Mail enthält Anhänge. ";
        }else{
            console.log(`Keine Anhänge vorhanden!`);
            //speakOutput += "Diese E-Mail hat keine Anhänge. ";
        }
        
        var maxTokens = 500;
        var maxWords = 100;
        var userMessage = "";
        var gptResponse = "";
        var repromptText = "";
        
        // Anfrage an die GPT-3 API senden
        const response = await openAI.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
              {"role": "system", "content": `Bitte fasse die folgende Mail innerhalb von ${maxWords} Worten zusammen. Ignoriere Signaturen und technischen Ausgaben. Nur wenn ein Datum in der Mail vorhanden ist, sollst du dies bitte als Terminvorschlag mitteilen, ansonsten ignoriere diesen Abschnitt`},
              {"role": "user", "content": emailBody}
          ],
          max_tokens: maxTokens,
        });
        
        

        // Extrahiere die Antwort von GPT
        gptResponse = response.choices[0].message.content;
        console.log(`GPT response: ${gptResponse}`);
        
        
        speakOutput+=gptResponse;
        speakOutput+=` Was möchtest du als nächstes machen? Sage "Vorlesen", "Antworten", "Zusammenfassen","Mail als gelesen markieren", SmartReply", "Nächste E-Mail" oder "Löschen", um mit der Mail zu interagieren.`;
        
        repromptText = `Was möchtest du als nächstes machen? Sage "Vorlesen", "Antworten", "Zusammenfassen","Mail als gelesen markieren", SmartReply", "Nächste E-Mail" oder "Löschen", um mit der Mail zu interagieren.`;
        
        return handlerInput.responseBuilder
            .speak(`Hier deine Zusammenfassung der Mail: ${speakOutput}`)
            .reprompt(repromptText)
            .getResponse();
    }
};




const SummarizeDayIntentHandler = {
    canHandle(handlerInput) {

        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'summarizeDayIntent';
    },
    async handle(handlerInput) {
        console.log("Verarbeitung des summarizeDayIntent.");
        
        console.log("Leere speakOutput.");
        var speakOutput = "";
        
        console.log("Speichere heutiges Datum in eine Variable.");
        var currentDay = new Date();
        currentDay = currentDay.toISOString().split('T')[0]; // Erzeugt einen String im Format 'YYYY-MM-DD'
        console.log(`currentDay: ${currentDay}`);
        
//**************************************************
//      Einholen der heutigen Aufgaben        
//**************************************************
        console.log("Ich hole die Aufgaben des heutigen Tages.");

        var tasks = await getTasksList(handlerInput, currentDay);
        var amountTasks = tasks.length;
                
        if(amountTasks === 0){
            speakOutput = speakOutput + ` Du hast keine Aufgaben für heute eingeplant.`;
        }else if(amountTasks === 1){
            speakOutput = speakOutput + ` Du hast ${amountTasks} Aufgabe für heute eingeplant.`;
        }else{
            speakOutput = speakOutput + ` Du hast ${amountTasks} Aufgaben für heute eingeplant.`;
        }
        console.log(`speakOutput: ${speakOutput}`);
        
//**************************************************
//      Einholen der heutigen E-Mails        
//**************************************************
        console.log("Ich hole die Mails des heutigen Tages.");
        const oauth2Client = new google.auth.OAuth2();
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        oauth2Client.setCredentials({
            access_token: accessToken,
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        var mails = await listEmails(gmail, "10", currentDay)
        var amountMails = mails.length; 

        if(amountMails === 0){
            speakOutput = speakOutput + ` Du hast keine E-Mails von heute in deiner Inbox.`;
        }else if(amountMails === 1){
            speakOutput = speakOutput + ` Du hast eine E-Mail von heute in deiner Inbox.`;
        }else{
            speakOutput = speakOutput + ` Du hast ${amountMails} E-Mails von heute in deiner Inbox.`;
        }
        console.log(`speakOutput: ${speakOutput}`);
//**************************************************
//      Einholen der heutigen Termine       
//**************************************************
        console.log("Ich hole die Termine des heutigen Tages.");
        var timeMin = moment().tz('Europe/Berlin').startOf('day').toISOString();
        console.log(`timeMin: ${timeMin}`);
        var events = await listNextEvents(accessToken, "10", timeMin); 
        var amountEvents = events.length;

        // Korrektur im speakOutput für Termine
        if(amountEvents === 0){
            speakOutput = speakOutput + ` Du hast keinen Termin für heute in deinem Kalender.`;
        }else if(amountEvents === 1){
            speakOutput = speakOutput + ` Du hast ${amountEvents} Termin in deinem Kalender.`;
        }else{
            speakOutput = speakOutput + ` Du hast ${amountEvents} Termine für heute in deinem Kalender.`;
        }

        console.log(`speakOutput: ${speakOutput}`);
        const repromptText = 'Möchtest Du mehr Details zu deinen Aufgaben, E-Mails oder Terminen erfahren, oder gibt es etwas anderes, bei dem ich Dir helfen kann?';

        return handlerInput.responseBuilder
            .speak(`Hier ist deine Zusammenfassung des ${currentDay}: ${speakOutput}`)
            .reprompt(repromptText) // Fügt einen Reprompt hinzu
            .withShouldEndSession(false) // Hält die Sitzung offen
            .getResponse();
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        // Gibt zurück, ob es sich um einen IntentRequest handelt
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        // Gibt den Namen des erkannten Intents zurück
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return handlerInput.responseBuilder
            .speak(`You just triggered ${intentName}.`)
            .getResponse();
    }
};

const AddTaskIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionCreateTask';
    },
    async handle(handlerInput) {
        console.log("Verarbeitung des AddTaskIntent.");

        const title = handlerInput.requestEnvelope.request.intent.slots.title.value;
        const details = handlerInput.requestEnvelope.request.intent.slots.details.value;
        const deadline = handlerInput.requestEnvelope.request.intent.slots.deadline.value;

        console.log(`Empfangene Werte: Titel - ${title}, Details - ${details}, Deadline - ${deadline}`);

        // Hier rufen Sie die Funktion auf, um den Task in Google Kalender hinzuzufügen
        try {
            await addTaskToGoogleCalendar(title, details, deadline, handlerInput);
            console.log("Task erfolgreich zu Google Kalender hinzugefügt.");
            const repromptText ="Was möchtest du als nächstes tun?";
            
            return handlerInput.responseBuilder
                .speak(`Die Aufgabe ${title} wurde hinzugefügt. Was möchtest du als nächstes tun?`)
                .reprompt(repromptText) // Fügt einen Reprompt hinzu
                .withShouldEndSession(false) // Hält die Sitzung offen
                .getResponse();
        } catch (error) {
            console.error("Fehler beim Hinzufügen des Tasks:", error);
            return handlerInput.responseBuilder
                .speak('Entschuldigung, es kam zu einem Fehler beim Hinzufügen der Aufgabe. Bitte versuche es später erneut.')
                .getResponse();
        }
    }
};

async function addTaskToGoogleCalendar(title, details, deadline, handlerInput) {
    console.log("Starte Funktion addTaskToGoogleCalendar.");

    // Konvertieren Sie das Datum/Deadline in das richtige Format
    const eventDateTime = new Date(deadline);

    const event = {
        'summary': title,
        'description': details,
        'start': {
            'dateTime': eventDateTime.toISOString(),
            'timeZone': 'Europe/Berlin'
        }
    };
    
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    
    console.log('Hole den AccessToken.');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
        access_token: accessToken,
    });
    console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
    
    
    console.log(`Erstelltes Event: ${JSON.stringify(event)}`);
    const tasks = google.tasks({ version: 'v1', auth: oauth2Client });
    console.log("Tasks Google Verbindung herstellen.");

    const taskListId = '@default'; // Die ID der Aufgabenliste, zu der die Aufgabe hinzugefügt wird, '@default' für die Hauptliste
    const task = {
        title: title,
        notes: details,
        due: (new Date(deadline)).toISOString()
    };
    console.log("TasksObjekt wurde erstellt.");

    await tasks.tasks.insert({
        tasklist: taskListId,
        resource: task
    });
    
    console.log(`Erstellte Aufgabe: ${JSON.stringify(task)}`);

    console.log("Aufgabe wurde erfolgreich zu Google Tasks hinzugefügt.");
}

const ListTasksIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionListTasks';
    },
    async handle(handlerInput) {
        console.log("Verarbeitung des ListTasksIntent.");

        try {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            const currentIndex = sessionAttributes.currentIndex || 0;

            const tasks = await getTasksList(handlerInput,"");
            
            sessionAttributes.tasks = tasks
            
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            
            
            const currentTask =  tasks[currentIndex];
            //const incompleteTasks = tasks.filter(task => task.status === 'completed');
            
            let responseMessage;
            sessionAttributes.currentIndex = currentIndex;
            
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                            
            if (tasks.length === 1){
                responseMessage = `Du hast eine offene Aufgabe mit dem Titel: ${currentTask.title}. Sage "Mehr Infos" oder "nächste Aufgabe" um mit der Aufgabe zu interagieren.`;

            }
            else if (tasks.length > 1) {
                responseMessage = `Du hast insgesamt ${tasks.length} Aufgaben. Die nächste offene Aufgabe hat den Titel: ${currentTask.title}. Sage "Mehr Infos" oder "nächste Aufgabe" um mit der Aufgabe zu interagieren.`;
                
            } else {
                responseMessage = "Du hast keine offenen Aufgaben.";
            }
            
            
            const repromptText ="Was möchtest du als nächstes tun?";
            
            return handlerInput.responseBuilder
                .speak(responseMessage)
                .reprompt(repromptText) // Fügt einen Reprompt hinzu
                .withShouldEndSession(false) // Hält die Sitzung offen
                .getResponse();
        } catch (error) {
            console.error("Fehler beim Abrufen der Aufgaben:", error);
            const repromptText ="Was möchtest du als nächstes tun?";
            
            return handlerInput.responseBuilder
                .speak('Entschuldigung, ich konnte deine Aufgaben nicht abrufen. Bitte versuche es später noch einmal.')
                .reprompt(repromptText) // Fügt einen Reprompt hinzu
                .withShouldEndSession(false) // Hält die Sitzung offen
                .getResponse();
        }
    }
};

async function getTasksList(handlerInput, dateStamp) {
    
    console.log("Abrufen der Aufgabenliste aus Google Tasks.");
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    
    console.log('Hole den AccessToken.');
    const oauth2Client = new google.auth.OAuth2();
    
    oauth2Client.setCredentials({
        access_token: accessToken,
    });
    console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
    
    const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

    console.log("Abrufen der Aufgabenliste aus Google Tasks.");

    try {
        
        const response = await tasksService.tasks.list({
            tasklist: '@default' // Die ID der Aufgabenliste
        });
        
        // Filtern der Aufgaben nach dem Datum, falls dateStamp gesetzt ist
        let filteredTasks = [];
        if (dateStamp) {
            const dateStampObject = new Date(dateStamp);
            filteredTasks = response.data.items.filter(task => {
                const taskDueDate = task.due ? new Date(task.due) : null;
                return taskDueDate && taskDueDate.toISOString().startsWith(dateStamp);
            });
        } else {
            filteredTasks = response.data.items;
        }

        if (response.data.items) {
            console.log("Aufgaben erfolgreich abgerufen.");
            return response.data.items.map(task => {
                return {
                    id: task.id,
                    title: task.title,
                    notes: task.notes,
                    due: task.due,
                    parent: task.parent,
                    selfLink: task.selfLink
                };
            });
        } else {
            console.log("Keine Aufgaben gefunden.");
            return [];
        }
    } catch (error) {
        console.error("Fehler beim Abrufen der Aufgabenliste:", error);
        throw error;
    }
}

const ReadTaskIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'readTaskIntent';
    },
    handle: async function(handlerInput) {
        console.log("ReadTaskIntentHandler");
        console.log("hole sessionAttributes");
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const tasks = sessionAttributes.tasks || [];
        var currentIndex = sessionAttributes.currentIndex || 0;
        console.log("currentIndex: "+currentIndex);
        const currentTask =  tasks[currentIndex];
        console.log("currentTaskID: "+currentTask.id);
        
        var dueDate = new Date(currentTask.due);
        var formattedDate = dueDate.toLocaleDateString('de-DE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        
        var responseMessage = "Hier die weiteren Infos für die Aufgabe mit dem Titel: "+currentTask.title+".\n";
        
        responseMessage = responseMessage+"die Notizen: "+currentTask.notes+".\n";
        responseMessage = responseMessage+"zu erledigen bis: "+formattedDate+".\n";
        
        responseMessage = responseMessage+'Sage "nächste Aufgabe", "lösche Aufgabe" oder "als erledigt markieren" um mit der Aufgabe zu interagieren.\n';
        
    
        const repromptText ="Was möchtest du als nächstes tun?";
        
        return handlerInput.responseBuilder
            .speak(responseMessage)
            .reprompt(repromptText)
            .withShouldEndSession(false)
            .getResponse();
    }
};

const MarkTaskAsDoneIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'markTaskAsDoneIntent';
    },
    handle: async function(handlerInput) {
        console.log("MarkTaskAsDoneIntentHandler");
        console.log("hole sessionAttributes");
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const tasks = sessionAttributes.tasks || [];
        var currentIndex = sessionAttributes.currentIndex || 0;
        console.log("currentIndex: "+currentIndex);
        const currentTask =  tasks[currentIndex];
        console.log("currentTaskID: "+currentTask.id);

        var currentTaskID = currentTask.id;
         console.log("currentTaskID: "+currentTaskID);
            try {
                        
                console.log('Hole den AccessToken.');
                const oauth2Client = new google.auth.OAuth2();
                 const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
                oauth2Client.setCredentials({
                    access_token: accessToken,
                });
                console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
                                
                var responseMessage = "Test";   
                const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });
                await tasksService.tasks.update({
                    tasklist: '@default', // Die ID der Aufgabenliste
                    task: `"${currentTask.selfLink}"`, // Die ID der Aufgabe
                    resource: {
                        status: 'completed'
                    }
                });
        
                console.log("Aufgabe wurde als erledigt markiert.");
                responseMessage = "Die Aufgabe wurde als erledigt markiert."
            } catch (error) {
                console.error("Fehler beim Markieren der Aufgabe als erledigt:", error);
                responseMessage = "Fehler beim Markieren der Aufgabe als erledigt:"+ error;
                throw error;
            }
        
        const repromptText ="Was möchtest du als nächstes tun?";
        
        return handlerInput.responseBuilder
            .speak(responseMessage)
            .reprompt(repromptText) // Fügt einen Reprompt hinzu
            .withShouldEndSession(false) // Hält die Sitzung offen
            .getResponse();
    }
};

const DeleteTaskIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'deleteTaskIntent';
    },
    handle: async function(handlerInput) {
        console.log("ReadTaskIntentHandler");
        console.log("hole sessionAttributes");
        
        var responseMessage = "Fehler beim Löschen deiner Aufgabe. ";
                
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const tasks = sessionAttributes.tasks || [];
        var currentIndex = sessionAttributes.currentIndex || 0;
        console.log("currentIndex: "+currentIndex);
        const currentTask =  tasks[currentIndex];
        console.log("currentTaskID: "+currentTask.id);
        
        console.log('Hole den AccessToken.');
        const oauth2Client = new google.auth.OAuth2();
         const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        oauth2Client.setCredentials({
            access_token: accessToken,
        });
        console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
        
    
        const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

        var repromptText = 'Was möchtest du als nächstes tun?';

        
        try {
            await tasksService.tasks.delete({
                tasklist: '@default',
                task: currentTask.id
            });
    
            console.log("Aufgabe wurde gelöscht.");
            responseMessage = "Die Aufgabe wurde gelöscht. Was möchtest du als nächstes tun?";
        } catch (error) {
            responseMessage = "Fehler beim Löschen der Aufgabe:", error;
            console.error("Fehler beim Löschen der Aufgabe:", error);
            throw error;
        }
    
        return handlerInput.responseBuilder
           .speak(responseMessage)
           .reprompt(repromptText)
           .getResponse();
    }
};

const NextTaskIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'nextTaskIntent';
    },
    handle(handlerInput) {
        console.log("NextTaskIntentHandler - Start der Function");
        
        console.log("NextTaskIntentHandler - Lese die sessionAttributes aus.");
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const tasks = sessionAttributes.tasks || [];
        console.log("NextTaskIntentHandler - Lese die Tasks aus.");
        
        var currentIndex = sessionAttributes.currentIndex || 0;
        
        
        console.log("NextTaskIntentHandler - Erhöhe den aktuellen Index um 1 um die nächste Aufgabe auszulesen.");
        currentIndex += 1;
        console.log("NextTaskIntentHandler - Lese den currentIndex aus.");
        
        const currentTask =  tasks[currentIndex];
        console.log("NextTaskIntentHandler - Lese den aktuellen Tasks mit neuem Index aus.");
        
        //const incompleteTasks = tasks.filter(task => task.status === 'completed');
        
        var responseMessage;
        if (tasks.length > 0) {
            responseMessage = `Die nächste offene Aufgabe hat den Titel: ${currentTask.title}. Sage "Mehr Infos" um weitere Infos zu erhalten. Sage "nächste Aufgabe" um die nächste Aufgabe zu hören.`;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            
        } else {
            responseMessage = "Du hast keine offenen Aufgaben.";
        }
        
        
        return handlerInput.responseBuilder
               .speak(responseMessage)
               .reprompt(`Sage "Mehr Infos" um Beschreibung der Aufgabe zu erhalten oder "nächste Aufgabe" um zur nächsten Aufgabe zu wechseln.`)
               .getResponse();
    }
};


const handleConversationWithGPT = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(`Prüfe, ob ich die GPT Conversation prüfen muss.`);
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
            (Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionFlowGPT' ||
             sessionAttributes.conversationStarted === true)
        );
    },
    async handle(handlerInput) {
        try {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

            if (!sessionAttributes.conversationStarted) {
                sessionAttributes.conversationStarted = true;
                sessionAttributes.conversation = '';
            }

            var repromptText = 'Was möchtest du fragen?';

            const maxTokens = 500;
            const maxWords = 100;
            
            const userMessage = Alexa.getSlotValue(handlerInput.requestEnvelope, 'userMessage');
            console.log(`handleConversationWithGPT - User's message: ${userMessage}`);
            
            const { responseBuilder, attributesManager } = handlerInput;

            // Holen Sie die bisherige Konversation aus den Session-Attributen
            let conversation = sessionAttributes.conversation || '';

            // Fügen Sie die Benutzereingabe zum Konversationsverlauf hinzu
            conversation += userMessage + '. \n\n ';
            if (userMessage.includes('Ende') || userMessage.includes('Tschüss')) {
                // Das Gespräch wurde beendet
                sessionAttributes.conversationStarted = false;
                
                return responseBuilder
                    .speak(gptResponse)
                    .reprompt(repromptText)
                    .getResponse();
            }

            // Anfrage an die GPT-3 API senden
            const response = await openAI.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {"role": "system", "content": `Sei Assitent. Antworte mit maximal ${maxWords} Worten.`},
                    {"role": "user", "content": conversation}
                ],
                max_tokens: maxTokens,
                temperature: 0.2,
                
            });
            

            // Extrahiere die Antwort von GPT
            const gptResponse = response.choices[0].message.content;
            console.log(`GPT response: ${gptResponse}`);

            // Fügen Sie die GPT-Antwort zum Konversationsverlauf hinzu
            conversation += gptResponse + '. \n\n ';

            // Aktualisieren Sie die Konversation in den Session-Attributen
            sessionAttributes.conversation = conversation;
            attributesManager.setSessionAttributes(sessionAttributes);
            
            console.log('Sending response to user...');

            return handlerInput.responseBuilder
                .speak(gptResponse)
                .reprompt('Was möchtest du als nächstes sagen?')
                .getResponse();

        } catch (error) {
            console.error('Error caught:', error);
            // Hier kannst du weitere Fehlerbehandlung hinzufügen
        }
    },
};

const ConversationCheckInterceptor = {
    process(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log("in ConversationCheckInterceptor drin.");
        // Prüfen, ob das 'conversation' Attribut auf true gesetzt ist
        sessionAttributes.shouldActivateConversationWithGPT = !!sessionAttributes.conversation;
        console.log(`Session attributes: ${JSON.stringify(sessionAttributes)}`);
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    }
};



const ChatGPTRequestInterceptor = {
    process(handlerInput) {
        console.log(`Bin im ChatGPTRequestInterceptor`);
        
        console.log(`Lese nun die Attribute aus!`);
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(`sessionAttributes: ${JSON.stringify(sessionAttributes)}`);
        
        const conversationStarted = sessionAttributes.conversationStarted;
        console.log(`conversationStarted aus: ${conversationStarted}`);
        
        const userMessage = Alexa.getSlotValue(handlerInput.requestEnvelope, 'userMessage');
        console.log(`userMessage: ${userMessage}`);
        
        if(conversationStarted === true){
            // Versuchen Sie, den AMAZON.SearchQuery-Slot abzurufen
            console.log("conversationStarted = true. passen die userMessage an.");
            try {
                const userMessage = Alexa.getSlotValue(handlerInput.requestEnvelope, 'userMessage');
                console.log(`User's message: ${userMessage}`);
                
                let newUserMessage = `chat ${userMessage}`;
                console.log(`newUserMessage aus: ${newUserMessage}`);
                
                //sessionAttributes.newUserMessage = newUserMessage
                //handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                handlerInput.requestEnvelope.request.intent.slots.userMessage.value = `Chat ${newUserMessage}`;
                
                console.log("UserMessage wurde angepasst!");
            } catch (error) {
                console.log(`Fehler aufgetreten: ${error.message}`);
            }
          
        } else{
            console.log("conversationStarted = false, daher wurde die UserMessage NICHT angepasst!");
        }
    }
};



const handleListMails = { //intent: interactionListMails
    canHandle(handlerInput) {
        const canHandle = Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionListMails';
        console.log(`In canHandle: canHandle=${canHandle}`);
        return canHandle;
    },
    handle(handlerInput) {
        console.log('Starte handleListMails-Funktion.');
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        
        if (!accessToken) {
            console.log('Kein Zugriffstoken verfügbar. Fordere Benutzer zur Kontoverknüpfung auf.');
            return handlerInput.responseBuilder
                .speak('Ich habe keinen Zugriff auf dein Gmail-Konto. Bitte erlaube mir den Zugang über die Alexa-App.')
                .withLinkAccountCard()
                .getResponse();
        }
            // Initialisiere den OAuth2-Client mit dem erhaltenen AccessToken.
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({
            access_token: accessToken,
        });
        console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
    
        const amountMails = handlerInput.requestEnvelope.request.intent.slots.amountMails.value || '8'; // Standardwert, falls leer
        const dayStampMails = handlerInput.requestEnvelope.request.intent.slots.dayStamp.value || ''; // Standardwert, falls leer
    
        console.log(`Requested amount of mails to retrieve: ${amountMails}`);
        console.log(`Requested date stamp for mails: ${dayStampMails}`);
    
        // Initialisiere das Gmail API-Client-Objekt.
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        console.log('Gmail-Client wurde initialisiert.');
    
        // Rufe die listEmails-Funktion auf, um die E-Mails abzurufen.
        console.log('Rufe listEmails-Funktion auf, um E-Mails zu listen.');
    
        return listEmails(gmail, amountMails, dayStampMails)
            .then(emailsDetails => {
                console.log(`Anzahl der abgerufenen E-Mails: ${emailsDetails.length}`);
                const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                sessionAttributes.emails = emailsDetails;
                sessionAttributes.currentIndex = 0;
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    
                let speakOutput = 'Es gibt keine E-Mails von heute in deiner Inbox.';
                if (emailsDetails.length > 0) {
                    const currentEmail = emailsDetails[0];
                    // Entferne spitze Klammern oder ersetze sie durch lesbare Zeichen
                    const mailID = currentEmail.id;
                    const from = currentEmail.from.replace(/</g, '').replace(/>/g, '');
                    const subject = currentEmail.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Ersetze für SSML-konforme Ausgabe
                    const mailText = currentEmail.text;
                    
                    speakOutput = `Die erste von ${emailsDetails.length} E-Mails ist von ${from} mit dem Betreff ${subject}. 
                                   Sage "Vorlesen", "Antworten", "Zusammenfassen","Mail als gelesen markieren", SmartReply", "Nächste E-Mail" oder "Löschen", um mit der Mail zu interagieren.`;
                    console.log('Erste E-Mail-Informationen wurden zusammengestellt und werden jetzt vorgelesen.');
                    console.log(`speakOutput: ${speakOutput}`);
                }
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt('Du kannst sagen "vorlesen","zusammenfassen", "nächste", "antworten" oder "löschen".')
                    .getResponse();
            })
            .catch(error => {
                console.error(`Fehler beim Auslesen der E-Mail-Details: ${error}`);
                return handlerInput.responseBuilder
                    .speak('Ich kann momentan keine E-Mails abrufen. Bitte versuche es später noch einmal.')
                    .getResponse();
            });
    }
}

function listEmails(gmail, amountMails, dayStampMails) {
    return new Promise((resolve, reject) => {
        // Stellen Sie die Suchanfrage zusammen basierend auf den Nutzerkriterien
        let query = 'is:unread'; // Beginn mit der Suche nach allen ungelesenen E-Mails
        console.log(`Basis-Suchquery: ${query}`);
        var date = "";
        
         // Überprüfe, ob 'today' angegeben wurde
        if (dayStampMails === 'today') {
            // Setze das Datum auf heute
            date = formatDateToGmailQuery(new Date());
        } else if (dayStampMails) {
            // Überprüfe, ob dayStampMails ein gültiges Datum ist
            const parsedDate = new Date(dayStampMails);
            if (!isNaN(parsedDate.getTime())) {
                date = formatDateToGmailQuery(parsedDate);
            } else {
                console.error('Ungültiges Datum in dayStampMails');
                reject(new Error('Ungültiges Datum'));
                return;
            }
        }
        if (date) {
            query += ` after:${date}`;
        }
    
        console.log(`Suchquery: ${query}`);

        // Führe die Suche mit der Gmail API durch
        console.log('Starte die Anfrage an die Gmail API...');
        gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: amountMails,
        }, (err, res) => {
            if (err) {
                console.log('Fehler beim Abfragen der Nachrichten:', err);
                reject(err);
            } else {
                // Extrahiere die Nachrichten-IDs aus der Antwort
                const messages = res.data.messages || [];
                console.log(`Gefundene Nachrichten: ${messages.length}`);

                // Erzeuge Promises, um die Details für jede Nachricht zu holen
                console.log('Hole Details für jede Nachricht...');
                const emailDetailsPromises = messages.map(message => {
                    return getEmailDetails(gmail, message.id);
                });

                // Warte darauf, dass alle Promises aufgelöst werden
                Promise.all(emailDetailsPromises)
                    .then(emailsDetails => {
                        console.log('E-Mail-Details erfolgreich abgerufen');
                        resolve(emailsDetails); // Gibt ein Array mit E-Mail-Details zurück
                    })
                    .catch(err => {
                        console.log('Fehler beim Abrufen der E-Mail-Details:', err);
                        reject(err);
                    });
            }
        });
    });
}

const ReadEmailIntentHandler = {
    canHandle(handlerInput) {
        const canHandle = Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ReadEmailIntent';
        console.log(`In canHandle: canHandle=${canHandle}`);
        return canHandle;
    },
    handle(handlerInput) {
        const accessToken = handlerInput.attributesManager.getSessionAttributes().accessToken;
        const gmail = getGmailClient(accessToken);
        
        console.log('In handle');
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(`Session attributes: ${JSON.stringify(sessionAttributes)}`);
        const emails = sessionAttributes.emails;
        const currentIndex = sessionAttributes.currentIndex;

        if (!emails || currentIndex >= emails.length) {
            console.log('Keine E-Mails zu lesen oder Index ungültig');
            return handlerInput.responseBuilder
                .speak('Es gibt keine E-Mail zum Vorlesen.')
                .reprompt('Sage "Weiter", um die nächste E-Mail zu hören, oder frage mich nach etwas anderem.')
                .getResponse();
        }

        // E-Mail-Details holen
        const currentEmail = emails[currentIndex];
        
        console.log(`Aktuelle E-Mail: ${JSON.stringify(currentEmail)}`);
        var speakOutput = "";
        
        // Überprüfen, ob der E-Mail-Text länger als 7500 Zeichen ist
        let emailBody = currentEmail.body;
        
        console.log("Kürze die Mail um Sonderzeichen");
        emailBody = emailBody.replace(/&auml;/g, "ä")
           .replace(/&ouml;/g, "ö")
           .replace(/&uuml;/g, "ü")
           .replace(/&Auml;/g, "Ä")
           .replace(/&Ouml;/g, "Ö")
           .replace(/&Uuml;/g, "Ü")
           .replace(/&szlig;/g, "ß");
        console.log("Umlaute ersetzt");
        emailBody = emailBody.replace('&zwnj;','');
        console.log("zwnj ersetzt");
        emailBody = emailBody.replace('&nbsp;','');
        console.log("nbsp ersetzt");
        emailBody = emailBody.replace('[image: Google]','');
        console.log("[image: Google] ersetzt");
        emailBody = emailBody.replace(/<[^>]*>/g, "");
        console.log("<*> ersetzt");
        emailBody = emailBody.replace(/([^{]+{[^}]*})+/g, "");
        emailBody = emailBody.replace('[','');
        console.log("[ ersetzt");
        emailBody = emailBody.replace(']','');
        console.log("] ersetzt");
        
        if (emailBody.length > 2000) {
            speakOutput = speakOutput+"Da der Text der Mail zu lang ist, habe ich diesen gekürzt. \n\n";
            emailBody = emailBody.substring(0, 2000) + '\n\n\n... E-Mail gekürzt. Der Text überschreitet das Maximum von 2000 Zeichen.';
        }
        
        speakOutput = speakOutput+`Der Text der Mail ist: ${emailBody}`;
        console.log(`speakOutput: ${speakOutput}`);

        markEmailAsRead(handlerInput, currentEmail.id).then(() => {
            console.log('Email marked as read successfully');
            // Fahren Sie mit dem Rest Ihres Codes fort...
          })
          .catch((error) => {
            console.error('Error marking email as read', error);
            // Behandeln Sie den Fehler oder informieren Sie den Benutzer...
          });

        sessionAttributes.currentIndex = currentIndex + 1;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        console.log(`Updated session attributes: ${JSON.stringify(sessionAttributes)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Sage "Weiter", um die nächste E-Mail zu hören, "Antworten", um zu antworten oder "Smart Reply" um KI für die Antwort zu nutzen.')
            .getResponse();
    }
};

async function markEmailAsRead(handlerInput, emailId) {
    console.log('Starting markEmailAsRead function');
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

    if (!accessToken) {
        console.log('Kein Zugriffstoken verfügbar. Fordere Benutzer zur Kontoverknüpfung auf.');
        return handlerInput.responseBuilder
            .speak('Ich habe keinen Zugriff auf dein Gmail-Konto. Bitte erlaube mir den Zugang über die Alexa-App.')
            .withLinkAccountCard()
            .getResponse();
    }

    // Initialisiere den OAuth2-Client mit dem erhaltenen AccessToken.
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
        access_token: accessToken,
    });
    
    console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
        await gmail.users.messages.modify({
            userId: 'me',
            id: emailId,
            resource: {
                removeLabelIds: ['UNREAD'] // Entfernt das Label "Ungelesen"
            }
        });
        console.log(`Email marked as read: EmailID = ${emailId}`);
    } catch (error) {
        console.error('Error in marking email as read:', error);
    }
}

function getGmailClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

const NextEmailIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NextEmailIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const emails = sessionAttributes.emails || [];
        
        let currentIndex = sessionAttributes.currentIndex || 0;
        console.log(`aus den sessionAttributes.currentIndex: ${currentIndex} `);
        console.log(`Erhöhe Index um 1`);
        currentIndex = currentIndex + 1;
        console.log(`currentIndex: ${currentIndex} `);
        
        // Überprüfen Sie, ob es noch weitere E-Mails gibt
        if (currentIndex >= emails.length) {
            const speakOutput = 'Es gibt keine weiteren E-Mails. Möchtest du etwas anderes tun?';
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt('Du kannst "Wiederhole", "Antworten" oder "Löschen" sagen, oder nach etwas anderem fragen.')
                .getResponse();
        }

        // E-Mail-Daten für die nächste E-Mail abrufen
        const nextEmail = emails[currentIndex];
        const speakOutput = `Nächste E-Mail ist von ${nextEmail.from} mit dem Betreff ${nextEmail.subject}. 
                             Sage "Vorlesen" um die gesamte Nachricht zu hören, "Nächste" um zur nächsten E-Mail zu gehen, 
                             "Antworten" um zu antworten, oder "Löschen" um diese E-Mail zu löschen.`;

        // Aktualisieren Sie den Index für die nächste E-Mail
        
        sessionAttributes.currentIndex = currentIndex;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Du kannst "Vorlesen", "Nächste", "Antworten" oder "Löschen" sagen.')
            .getResponse();
    }
};

const DeleteEmailIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'deleteMailIntent';
    },
    handle: async function(handlerInput) { // Ändern Sie diese Zeile, um die Funktion asynchron zu machen
        var speakOutput = "";
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const emails = sessionAttributes.emails || [];
        
        let currentIndex = sessionAttributes.currentIndex || 0;
        const currentEmail = emails[currentIndex];

        if (!currentEmail) {
            speakOutput = "Es gibt keine E-Mail zum Löschen.";
        } else {
            try {
                const oauth2Client = new google.auth.OAuth2();
                const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
                oauth2Client.setCredentials({
                    access_token: accessToken,
                });

                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                await gmail.users.messages.trash({
                    userId: 'me',
                    id: currentEmail.id // Stellen Sie sicher, dass jede E-Mail eine ID hat
                });

                speakOutput = "Die E-Mail wurde gelöscht.";
                console.log(`E-Mail mit ID ${currentEmail.id} gelöscht.`);

                // Aktualisieren Sie die E-Mail-Liste und den Index
                emails.splice(currentIndex, 1); // Entfernt die gelöschte E-Mail aus dem Array
                sessionAttributes.currentIndex = currentIndex < emails.length ? currentIndex : 0;
            } catch (error) {
                console.error("Fehler beim Löschen der E-Mail:", error);
                speakOutput = "Fehler beim Löschen der E-Mail.";
            }
        }
        
        sessionAttributes.emails = emails;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Du kannst "Vorlesen", "Nächste Mail", "Antworten" oder "Mail Löschen" sagen.')
            .getResponse();
    }
};


const MarkMailAsReadedHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'markMailAsReaded';
    },
    handle(handlerInput) {
        var speakOutput = "";
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const emails = sessionAttributes.emails || [];
        
        let currentIndex = sessionAttributes.currentIndex || 0;
        console.log(`aus den sessionAttributes.currentIndex: ${currentIndex} `);
        console.log(`Erhöhe Index um 1`);
        currentIndex = currentIndex + 1;
        console.log(`currentIndex: ${currentIndex} `);

        var currentEmail = emails[currentIndex];
        
        console.log(`Versuche Mail ${currentEmail.id} als gelesen zu markieren.`);
        markEmailAsRead(handlerInput, currentEmail.id);
        
        sessionAttributes.currentIndex = currentIndex;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Du kannst "Vorlesen", "Nächste Mail", "Antworten" oder "Mail Löschen" sagen.')
            .getResponse();
    }
};

const remindMeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'remindMeIntent';
    },
    handle: async function(handlerInput) {
        // Erstellen Sie den Skill-Builder und fügen Sie die benötigten Konfigurationen hinzu
        const skillBuilder = Alexa.SkillBuilders.custom();

        const topic = Alexa.getSlotValue(handlerInput.requestEnvelope, 'topic');
        console.log(`activity: ${topic}`);
        const time = Alexa.getSlotValue(handlerInput.requestEnvelope, 'time');
        console.log(`time: ${time}`);
        try {
            const reminderRequest = {
                requestTime: new Date().toISOString(),
                trigger: {
                    type: "SCHEDULED_ABSOLUTE",
                    scheduledTime: time,
                    timeZoneId: "Europe/Berlin" // Zeitzone anpassen
                },
                alertInfo: {
                    spokenInfo: {
                        content: [{
                            locale: "de-DE",
                            text: topic
                        }]
                    }
                },
                pushNotification: {
                    status: "ENABLED"
                }
            };

            const client = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
            const reminderResponse = await client.createReminder(reminderRequest);
            console.log('Erinnerung erstellt: ', reminderResponse);

            return handlerInput.responseBuilder
                .speak(`Okay, ich werde dich an ${topic} um ${time} erinnern.`)
                .getResponse();
        } catch (error) {
            console.error(`Fehler beim Erstellen der Erinnerung: ${error}`);
            return handlerInput.responseBuilder
                .speak('Es gab ein Problem beim Erstellen der Erinnerung.')
                .getResponse();
        }
    }
};

const replyWithGPTIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'replyWithGPT';
    },
    async handle(handlerInput) {
        
        console.log("Starte replyWithGPTIntentHandler");
        
        var maxTokens = 500;
        var maxWords = 100;
        
        console.log("Lese die Variablen aus der Session:");

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(`sessionAttributes: ${sessionAttributes}`);
        
        const emails = sessionAttributes.emails || [];
        console.log(`emails: ${emails}`);
        
        const currentIndex = sessionAttributes.currentIndex ? sessionAttributes.currentIndex - 1 : 0;
        console.log(`currentIndex: ${currentIndex}`);
    
        // Überprüfen, ob der Benutzer bei einer gültigen E-Mail-Position ist, um zu antworten
        if (!emails.length || currentIndex < 0 || currentIndex >= emails.length) {
            console.log("Ungültige Position oder keine E-Mails zum Antworten vorhanden.");
            return handlerInput.responseBuilder
                .speak('Es gibt keine E-Mail, auf die du antworten kannst.')
                .reprompt('Sage "Nächste", um die nächste E-Mail zu hören oder führe eine andere Aktion aus.')
                .getResponse();
        }
        
        const currentEmail = emails[currentIndex];
        const receiverEmail = currentEmail.senderMail; // Verwenden Sie die zuvor gespeicherte E-Mail-Adresse des Senders
        console.log(`receiverEmail: ${receiverEmail}`);
        
        const subject = `Re: ${currentEmail.subject}`; // Fügen Sie "Re:" zum Betreff der aktuellen E-Mail hinzu
        console.log(`subject: ${subject}`);
        
        var mailContent = currentEmail.body;
        console.log(`mailContent: ${mailContent}`);
        
        var toneOfResponse = handlerInput.requestEnvelope.request.intent.slots.toneOfResponse.value;
        console.log(`toneOfResponse: ${toneOfResponse}`);
        
        var coreResponse = handlerInput.requestEnvelope.request.intent.slots.coreResponse.value;
        console.log(`coreResponse: ${coreResponse}`);
        
        //TODO: hier muss die GPT Anfrage rein
        const responseGPT = "";
        
        // Anfrage an die GPT-3 API senden
        const response = await openAI.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
              {"role": "system", "content": `Du sollst eine Anwortmail schreiben. Die folgende Mail hat der User erhalten. Berücksichtige bitte das duzen oder siezen. Die Antwort soll folgendes ausdrücken: "${coreResponse}". Bitte schreibe die Mail ${toneOfResponse} und fasse dich kurz, mit maximal ${maxWords} Worten.`},
              {"role": "user", "content": mailContent}
          ],
          max_tokens: maxTokens,
        });
        
        let gptResponse = response.choices[0].message.content;
        console.log(`GPT response: ${gptResponse}`);
        
        gptResponse = gptResponse + "\n Wurde mit ChatGPT geschrieben...\n";
        gptResponse = gptResponse + "\n----------------------------------------\n\n";
        gptResponse = gptResponse + mailContent;


        try {
            console.log(`Sende Antwort an ${receiverEmail} mit dem Betreff "${subject}"`);
            await sendEmail(receiverEmail, subject, gptResponse, handlerInput);
            
            console.log("Antwort erfolgreich gesendet.");
            return handlerInput.responseBuilder
                .speak('Deine Antwort wurde gesendet.')
                .reprompt('Kann ich sonst noch etwas für dich tun?')
                .getResponse();
        } catch (error) {
            console.error("Fehler beim Senden der E-Mail:", error);
            return handlerInput.responseBuilder
                .speak('Entschuldigung, ich konnte die Antwort nicht senden. Bitte versuche es später noch einmal.')
                .getResponse();
        }
        
    }
};


const ReplyEmailIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ReplyEmailIntent';
    },
    async handle(handlerInput) {
        console.log("Starte ReplyEmailIntentHandler");
        
        console.log("Lese die Variablen aus der Session:");

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        console.log(`sessionAttributes: ${sessionAttributes}`);
        
        const emails = sessionAttributes.emails || [];
        console.log(`emails: ${emails}`);
        
        const currentIndex = sessionAttributes.currentIndex ? sessionAttributes.currentIndex - 1 : 0;
        console.log(`currentIndex: ${currentIndex}`);

        // Überprüfen, ob der Benutzer bei einer gültigen E-Mail-Position ist, um zu antworten
        if (!emails.length || currentIndex < 0 || currentIndex >= emails.length) {
            console.log("Ungültige Position oder keine E-Mails zum Antworten vorhanden.");
            return handlerInput.responseBuilder
                .speak('Es gibt keine E-Mail, auf die du antworten kannst.')
                .reprompt('Sage "Nächste", um die nächste E-Mail zu hören oder führe eine andere Aktion aus.')
                .getResponse();
        }

        const currentEmail = emails[currentIndex];
        const receiverEmail = currentEmail.senderMail; // Verwenden Sie die zuvor gespeicherte E-Mail-Adresse des Senders
        console.log(`receiverEmail: ${receiverEmail}`);
        
        const subject = `Re: ${currentEmail.subject}`; // Fügen Sie "Re:" zum Betreff der aktuellen E-Mail hinzu
        console.log(`subject: ${subject}`);
        
        //const content = 'Hier ist der Text, der als Antwort gesendet werden soll.'; // Hier soll der Inhalt der Antwort stehen
        const content = handlerInput.requestEnvelope.request.intent.slots.messageText.value;
        console.log(`content: ${content}`);
    
        
        try {
            console.log(`Sende Antwort an ${receiverEmail} mit dem Betreff "${subject}"`);
            await sendEmail(receiverEmail, subject, content, handlerInput);
            
            console.log("Antwort erfolgreich gesendet.");
            return handlerInput.responseBuilder
                .speak('Deine Antwort wurde gesendet.')
                .reprompt('Kann ich sonst noch etwas für dich tun?')
                .getResponse();
        } catch (error) {
            console.error("Fehler beim Senden der E-Mail:", error);
            return handlerInput.responseBuilder
                .speak('Entschuldigung, ich konnte die Antwort nicht senden. Bitte versuche es später noch einmal.')
                .getResponse();
        }
    }
};


function getEmailDetails(gmail, messageId) {
    return new Promise((resolve, reject) => {
        gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full' // Hier ändern Sie 'metadata' zu 'full', wenn Sie den gesamten E-Mail-Body benötigen
        }, (err, res) => {
            if (err) {
                console.log('Fehler beim Abrufen der E-Mail-Details:', err);
                reject(err);
            } else {
                // Parse die benötigten Header-Informationen und den Body der Nachricht
                const id = res.data.id;
                console.log(`Mail ID: ${id}`);
                const headers = res.data.payload.headers;
                const parts = res.data.payload.parts || [res.data.payload];
                let body = '';
                let hasAttachments = false;
                
                for (const part of parts) {
                    if (part.parts) {
                        body += part.parts.map(subpart => {
                            // Überprüfen, ob es sich um einen Anhang handelt
                            if (subpart.filename && subpart.filename.length > 0) {
                                hasAttachments = true;
                            }
                            return subpart.body.data;
                        }).join('');
                    } else {
                        if (part.filename && part.filename.length > 0) {
                            hasAttachments = true;
                        }
                        body += part.body.data || '';
                    }
                }
                
                
                // Dekodieren Sie den Base64-String in lesbares Format
                let decodedBody = Buffer.from(body, 'base64').toString('utf-8');

                // Ersetzen Sie Sonderzeichen und bereinigen Sie den Text
                console.log("Kürze die Mail um Sonderzeichen");
                decodedBody = decodedBody.replace(/&auml;/g, "ä")
                   .replace(/&ouml;/g, "ö")
                   .replace(/&uuml;/g, "ü")
                   .replace(/&Auml;/g, "Ä")
                   .replace(/&Ouml;/g, "Ö")
                   .replace(/&Uuml;/g, "Ü")
                   .replace(/&szlig;/g, "ß");
                console.log("Umlaute ersetzt");
                decodedBody = decodedBody.replace('&zwnj;', '');
                console.log("zwnj ersetzt");
                decodedBody = decodedBody.replace('&nbsp;', '');
                console.log("nbsp ersetzt");
                decodedBody = decodedBody.replace('[image: Google]', '');
                console.log("[image: Google] ersetzt");
                decodedBody = decodedBody.replace(/<[^>]*>/g, "");
                console.log("<*> ersetzt");
                decodedBody = decodedBody.replace(/([^{]+{[^}]*})+/g, "");
                decodedBody = decodedBody.replace('[', '');
                console.log("[ ersetzt");
                decodedBody = decodedBody.replace(']', '');
                console.log("] ersetzt");

                // Kürzen Sie den Body auf 2000 Zeichen, falls notwendig
                if (decodedBody.length > 2000) {
                    decodedBody = decodedBody.substring(0, 2000);
                }

                const subjectHeader = headers.find(header => header.name === 'Subject');
                const fromHeader = headers.find(header => header.name === 'From');
                
                const subject = subjectHeader ? subjectHeader.value : 'Kein Betreff';
                let from = fromHeader ? fromHeader.value : 'Unbekannter Absender';
                let senderMail = from.match(/<(.+)>/);
                senderMail = senderMail ? senderMail[1] : from;
                from = from.replace(/<.+>/, '');
                
                console.log(`decodedBody: ${decodedBody}`);
                console.log(`Anhänge vorhanden: ${hasAttachments}`);
                
                resolve({ id, subject, from, senderMail, body: decodedBody, hasAttachments });
             }
        });
    });
}


function formatDateToGmailQuery(date) {
    // Formatieren Sie das Datum in das von Gmail erwartete Query-Format 'yyyy/mm/dd'
    const formattedDate = date.toISOString().substring(0, 10).replace(/-/g, '/');
    console.log(`Formatiertes Datum für die Gmail-Suche: ${formattedDate}`);
    return formattedDate;
}


function sendEmail(receiver, subject, content, handlerInput) {
    console.log('Erstelle OAuth2-Client zur Authentifizierung bei der Gmail-API.');
    
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    
    console.log('Aktualisiere das Zugriffstoken.');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
        access_token: accessToken,
    });
    console.log('OAuth2-Client wurde mit dem AccessToken initialisiert.');
        
    //oauth2Client.refreshAccessToken().then(tokens => {
    //    console.log('Zugriffstoken aktualisiert: ', tokens);
    
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        console.log('Erstelle die Rohdaten der Nachricht für die E-Mail.');
    
        const rawMessageString = `Content-Type: text/plain; charset="UTF-8"\n` +
                                 `MIME-Version: 1.0\n` +
                                 `Content-Transfer-Encoding: 7bit\n` +
                                 `to: ${receiver}\n` +
                                 `subject: ${subject}\n\n` +
                                 `${content}`;
    
        console.log(`Konvertiere die Nachricht in das Base64-URL-sichere Format.`);
        const encodedMessage = Buffer.from(rawMessageString)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
    
        console.log('Rufe Gmail API auf, um die Nachricht zu senden.');
        gmail.users.messages.send({
          userId: 'me',
          resource: {
            raw: encodedMessage
          }
        }, (err, result) => {
          if (err) {
            console.error('Die Gmail-API hat einen Fehler zurückgegeben: ', err);
          } else {
            console.log('Nachricht gesendet: ', result.data);
          }
        });
  //}).catch(error => {
    //    console.error('Fehler beim Aktualisieren des Zugriffstokens: ', error);
  //});
}

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Mit mir kannst Du E-Mails auflisten, zusammenfassen und antworten. Sag zum Beispiel "Liste meine Mails auf" oder "Schreibe eine Mail". Du kannst auch Termine erstellen oder auflisten. Sage hierzu, liste meine Termine auf oder erstelle einen Termin. Du kannst auch mit ChatGPT sprechen, beginne hierzu den Satz immer mit dem Codeword bot oder chat. Also was möchtest du tun?';
        const repromptText = 'Wie kann ich dir helfen?';
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptText) // Fügt einen Reprompt hinzu
            .withShouldEndSession(false) // Hält die Sitzung offen
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = ' Vielen Dank, dass du smartOffice genutzt hast. Auf Wiedersehen!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};


const SkillHandler = {
    canHandle(handlerInput) {
    // Definieren Sie hier die Logik, um zu bestimmen, ob Ihr Handler die Anforderung bearbeiten kann.
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
  },
  handle(handlerInput) {
    const oauth2Client = new google.auth.OAuth2();
    
    oauth2Client.refreshAccessToken();
    
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
    
    if (!accessToken) {
      // Der Benutzer hat den Skill noch nicht verknüpft, senden Sie eine Verknüpfungsanfrage.
      return handlerInput.responseBuilder
        .speak('Bitte verknüpfen Sie zuerst Ihr Konto mit dem Skill, über die Alexa-App.')
        .withLinkAccountCard() // Diese Zeile sendet eine Kartenanfrage an die Alexa-App, um den Account Linking Prozess zu starten.
        .getResponse();
    }
    // Sende eine Antwort zurück zum Benutzer
    return handlerInput.responseBuilder
      .speak('Hier ist Ihre Antwort nach der erfolgreichen Kontoverknüpfung.')
      // . Weitere Response-Konfiguration
      .getResponse();
  },
};

/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
 
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        let speakOutput = 'Test';
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const conversationStarted = sessionAttributes.conversationStarted;

        // Versuchen Sie, den AMAZON.SearchQuery-Slot abzurufen
        const userQuery = Alexa.getSlotValue(handlerInput.requestEnvelope, 'query');
        const userMessage = Alexa.getSlotValue(handlerInput.requestEnvelope, 'userMessage');

        console.log(`FallbackIntentHandler - conversationStarted: ${conversationStarted}`);
        console.log(`FallbackIntentHandler - userMessage: ${userMessage}`);
        console.log(`FallbackIntentHandler - userQuery: ${userQuery}`);


        if (conversationStarted === true) {
            /*/ Die Konversation läuft bereits, rufe den interactionFlowGPT-Intent auf
            return handlerInput.responseBuilder
                .addDelegateDirective({
                    name: 'interactionFlowGPT',
                    confirmationStatus: 'NONE',
                    slots: {
                        userQuery: userQuery,
                        userMessage: userMessage // der vom Benutzer gesprochenen Text wird an den Intent weitergegeben
                    }
                })
                .getResponse();*/
        } else {
            speakOutput = 'Hierbei kann ich dir leider nicht helfen. Bitte wiederhole deine Aussage mit anderen Worten und vergewissere dich, dass ich diese Funktion anbiete.';
        }

        console.log(`FallbackIntentHandler - speakOutput: ${speakOutput}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Wie kann ich dir helfen?')
            .getResponse();
    }
};

/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

//interactionListNextEvent

const handleListNextEvent = {
    canHandle(handlerInput) {       
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionListNextEvent';
    },
    handle(handlerInput) {
        const speakOutput = `Du bist im Intent interactionListNextEvent`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const handleCreateMail = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionCreateMail';
    },
    handle(handlerInput) {
        
        const receiver = handlerInput.requestEnvelope.request.intent.slots.receiver.value;
        const subject = handlerInput.requestEnvelope.request.intent.slots.subject.value;
        const content = handlerInput.requestEnvelope.request.intent.slots.content.value;
        const parsedReceiver = parseReceiver(receiver);
    
        sendEmail(parsedReceiver, subject, content, handlerInput);
        
        const speakOutput = `Ich habe die Mail an ${parsedReceiver} versandt.`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
}


const handleListEvents = { //Intentname = interactionListEvents
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionListEvents';
    },
    handle(handlerInput) {
        const oauth2Client = new google.auth.OAuth2();
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        console.log(`OAuth Client und Token wurden ausgelesen: ${accessToken}`);
    
        // Holen Sie sich den Wert aus dem Slot 'dayStamp', der das Datum darstellt, für das Ereignisse gesucht werden sollen.
        let dayStamp = handlerInput.requestEnvelope.request.intent.slots.dayStamp.value;
        let timeMin; // Dies wird die minimale Zeit darstellen, ab der Ereignisse gesucht werden sollen.
      
        if (!dayStamp || dayStamp === 'today') {
            // Setzen Sie das Datum auf heute um 0 Uhr in der Zeitzone 'Europe/Berlin'.
            timeMin = moment().tz('Europe/Berlin').startOf('day').toISOString();
        } else {
            // Wenn 'dayStamp' ein spezifisches Datum ist, sollten Sie es entsprechend verarbeiten.
            // Hier verwenden Sie 'dayStamp' und konvertieren es in das ISO-Format.
            // Stellen Sie sicher, dass 'dayStamp' im richtigen Format ist oder fügen Sie zusätzliche Validierung/Formatierung hinzu.
            timeMin = moment.tz(dayStamp, "Europe/Berlin").startOf('day').toISOString();
        }
        
        console.log(`Suche Ereignisse ab: ${timeMin}`);
        
        // Hier fügen wir `return` hinzu, um sicherzustellen, dass der Skill die Promise-Kette zurückgibt.
        return listNextEvents(accessToken, 10, timeMin)
          .then(events => {
            // Logge die Anzahl der Events
            console.log(`Gebe die Events aus. Länge der EventListe: ${events.length}`);
        
            // Prüfen, ob Ereignisse vorhanden sind
            let speakOutput = '';
            if (events.length > 0) {
              speakOutput = `Du hast ${events.length} bevorstehende Termine. Hier sind sie: `;
              // Hinzufügen von Details der ersten drei Ereignisse zum Sprachausgang
              events.slice(0, 6).forEach((event, index) => {
                const eventStart = event.start.dateTime || event.start.date; // Ganztägige Ereignisse haben nur ein Datum
                const day = new Date(eventStart).toLocaleDateString("de-DE");
                const time = event.start.dateTime ? new Date(eventStart).toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' }) : 'den ganzen Tag';
                speakOutput += `Termin ${index + 1}, ${event.summary}, findet statt am ${day} ${time}. `;
              });
            } else {
              speakOutput = 'Du hast keine bevorstehenden Termine.';
            }
            // Sende die zusammengesetzte Antwort an den Benutzer
            return handlerInput.responseBuilder
              .speak(speakOutput)
              .reprompt('Kann ich sonst noch etwas für dich tun?')
              .getResponse();
          })
          .catch(err => {
            console.log(`Fehler beim Abrufen der Ereignisse: ${err}`);
            return handlerInput.responseBuilder
              .speak('Entschuldigung, ich konnte deine Termine nicht abrufen. Bitte versuche es später erneut.')
              .getResponse();
          });
    }
}
    
function listNextEvents(_accessToken, _amount, _date) {
  const oauth2Client = new google.auth.OAuth2();
  console.log(`_accessToken:${_accessToken}`);
  console.log(`_amount:${_amount}`);
  console.log(`_date:${_date}`);
  
  let timeMin = _date;
  
  console.log(`timeMin:${timeMin}`);
  
  return new Promise((resolve, reject) => {
    oauth2Client.setCredentials({
      access_token: _accessToken, // Der Zugangstoken, der im Account Linking Flow erworben wurde
    });

    const calendar = google.calendar({version: 'v3', auth: oauth2Client});
    console.log(`calendar wurde erstellt:${calendar}`);
    
    calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin, // Verwenden Sie hier die konvertierte Zeit
        maxResults: parseInt(_amount, 10), // Stellen Sie sicher, dass dies eine Zahl ist
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, res) => {
      if (err) {
          console.log(`Fehler in der Auflistung von Events: ${err}`);
        reject(err);
      } else {
        resolve(res.data.items);
      }
    });
  });
}  


// Funktion zum Umwandeln des Benutzernamens in eine E-Mail-Adresse
function parseReceiver(receiver) {
    // Entferne Leerzeichen aus dem Benutzernamen
    const usernameWithoutSpaces = receiver.replace(/\s+/g, '');

    // Ersetze Zeichen:
    var receiverWithEmail = usernameWithoutSpaces.replace(/punkt/g, '.');
    receiverWithEmail = receiverWithEmail.replace(/\s+/g, '');// Entferne alle verbleibenden Leerzeichen
    receiverWithEmail = receiverWithEmail.replace(/at/g, '@'); // Ersetze "at" durch "@"
    receiverWithEmail = receiverWithEmail.replace(/bindestrich/g, '-'); // Ersetze "bindestrich" durch "-"
    receiverWithEmail = receiverWithEmail.replace(/minus/g, '-'); // Ersetze "unterstrich" durch "_"
    receiverWithEmail = receiverWithEmail.replace(/unterstrich/g, '_');
    receiverWithEmail = receiverWithEmail.replace(/plus/g, '+'); // Ersetze "plus" durch "+"

    return receiverWithEmail;
}
    
    
const handleCreateEvent = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'interactionCreateEvent';
    },
    handle(handlerInput) {
        console.log(`Lese Variablen ein:`);
        const receiver = handlerInput.requestEnvelope.request.intent.slots.receiver.value;
        console.log(`receiver: ${receiver}`);
        const date = handlerInput.requestEnvelope.request.intent.slots.date.value;
        console.log(`date: ${date}`);
        const starttime = handlerInput.requestEnvelope.request.intent.slots.startTime.value;
        console.log(`starttime: ${starttime}`);
        const endtime = handlerInput.requestEnvelope.request.intent.slots.endTime.value; // Angenommen Dauer ist in Minuten
        console.log(`duration: ${endtime}`);
        const content = handlerInput.requestEnvelope.request.intent.slots.content.value;
        console.log(`content: ${content}`);
        const title = handlerInput.requestEnvelope.request.intent.slots.title.value;
        console.log(`title: ${title}`);
        
        //Format für den Temrin: 2023-05-28T09:00:00-07:00 
        //                       2023-11-08T16:00+01:00
        
        var startTimeMoment = "";
        var endTimeMoment = "";
        
        const startTimeString = `${date}T${starttime}:00+01:00`;
        console.log(`startTime: ${startTimeString}`);
      
        const endTimeString = `${date}T${endtime}:00+01:00`;
        console.log(`endTimeString: ${endTimeString}`);
      
        const parsedReceiver = parseReceiver(receiver);
        console.log(`parsedReceiver: ${parsedReceiver}`);
      
      
        console.log(`Erstelle nun den Termin mit Hilfe der Variablen.`);
        const event = {
            'summary': title,
            'description': content,
            'start': {
              'dateTime': startTimeString,
              'timeZone': 'Europe/Berlin',
            },
            'end': {
              'dateTime': endTimeString,
              'timeZone': 'Europe/Berlin',
            },
            'attendees': [
              { 'email': parsedReceiver } // Füge den Empfänger hinzu
            ],
    
          };
        console.log(`Termin ${event.content} wurde erstellt.`);
        
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        console.log(`Token geholt: ${accessToken}`);
         
         return new Promise((resolve, reject) => {
                createGoogleCalendarEvent(accessToken, event).then((createdEvent) => {
                    const speakOutput = `Die Erstellung hat geklappt. Es wurde ein Termin erstellt mit dem Titel: ${createdEvent.data.summary}`;
                    console.log(`Termin wurde erstellt erstellt. ${createdEvent.data.summary}`);
                    resolve(handlerInput.responseBuilder
                        .speak(speakOutput)
                        .getResponse());
                }).catch((error) => {
                    const speakOutput = `Bei der Erstellung des Termins ist ein Fehler aufgetreten. Versuche es bitte erneut. Fehlerdetails: ${error}`;
                    console.error(`Fehler bei der Terminerstellung:`, error);
                    resolve(handlerInput.responseBuilder
                        .speak(speakOutput)
                        .getResponse());
                });
            });
    }
}


function createGoogleCalendarEvent(accessToken, event) {
  const oauth2Client = new google.auth.OAuth2();
  
  console.log(`in createGoogleCalendarEvent`);
  
  oauth2Client.setCredentials({
    access_token: accessToken,
  });
  
  console.log(`setCredentials ausgeführt`);
  
  
  const calendar = google.calendar({version: 'v3', auth: oauth2Client});
  
  console.log(`Konstante Calender wurde gefüllt.`);

  return new Promise((resolve, reject) => {
    calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    }, (err, event) => {
      if (err) {
        reject(err);
        console.error(`Error:${err}` );
      } else {
        resolve(event);
        console.log(`Erfolgreich: ${event.title}${event.dateTime}`);
      }
    });
  });
}


const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Entschuldigung, ich habe Probleme dir zu helfen, versuche es später nochmal!';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};


exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        SummarizeMailIntentHandler,
        SummarizeDayIntentHandler,
        NextTaskIntentHandler,
        MarkTaskAsDoneIntentHandler,
        DeleteTaskIntentHandler,
        ReadTaskIntentHandler,
        AddTaskIntentHandler,
        ListTasksIntentHandler,
        handleConversationWithGPT,
        replyWithGPTIntentHandler,
        LaunchRequestHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        ReadEmailIntentHandler,
        NextEmailIntentHandler,
        ReplyEmailIntentHandler,
        MarkMailAsReadedHandler,
        DeleteEmailIntentHandler,
        handleListMails,
        handleCreateMail,
        handleListEvents,
        handleCreateEvent,
        remindMeIntentHandler,
        IntentReflectorHandler
    )
    .addErrorHandlers(
        ErrorHandler
    )
    .addRequestInterceptors(
        //ChatGPTRequestInterceptor
        //ConversationCheckInterceptor
    )
    .withApiClient(new Alexa.DefaultApiClient()) // Hier fügen Sie den API-Client hinzu
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();
