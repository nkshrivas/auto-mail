//here i used yarn package manager to manage packages
//Requiring nessecory packages from node js

const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');
const express = require('express');
const app = express();

//Defining Scopes here to get the user permissions
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://mail.google.com',
];

//Creating route for the browser to hit the api end point
app.get('/',async (req,res)=>{

  //load client secret from a local file
  const credentials = await fs.readFile('credentials.json');

  //Authorize a client with credentials, then call the Gmail API.
  const auth = await authenticate({
    keyfilePath:path.join(__dirname,'credentials.json'),
    scopes:SCOPES,
  });

  const gmail = google.gmail({version:'v1',auth});

  const response = await gmail.users.labels.list({
    userId:'me',
  });

   //Giving custom label name here
   const LABEL_NAME = 'autoMail';

   //Load credential from file
   async function loadcredentials(){
    const filePath = path.join(process.cwd(),'credentials.json');
    const content  = await fs.readFile(filePath,{encoding:'utf8'});
    return JSON.parse(content);
   }

   //Get messages that have no prior replies
   async function getUnrepliedMessages(auth){
    const gmail = google.gmail({version:'v1',auth});
    const res = await gmail.users.messages.list({
      userId:'me',
      q:'-in:chats -from:me -has:userlabels',
    });
    return res.data.messages ||[];
   }

   //send reply to a message\
   async function sendReply(auth,message){
    const gmail = google.gmail({version:'v1',auth});
    const res = await gmail.users.messages.get({
      userId:'me',
      id:message.id,
      format:'metadata',
      metadataHeaders:['Subject','From'],
    });
    const subject = res.data.payload.headers.find(
      (header)=> header.name === 'Subject'
    ).value;
    const from = res.data.payload.headers.find(
      (header)=> header.name==='From'
    ).value;
    
    //writing reply message here
    const replyTo = from.match(/<(.*)>/)[1];
    const replySubject = subject.startsWith('Re:') ? subject :`Re: ${subject}`;
    const replyBody = `Hi,\n\n I'm currently on vacation and will get back to you soon.\n\nBest,\nNikhil Kumar`;
    const rawMessage = [
      `From:me`,
      `To:${replyTo}`,
      `Subject:${replySubject}`,
      `In-Reply-To:${message.id}`,
      `References: ${message.id}`,
      '',
      replyBody,
    ].join('\n');
    const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await gmail.users.messages.send({
      userId:'me',
      requestBody:{
        raw:encodedMessage,
      },
    });
   }
  

   //Creating new label here if not exist using gmail api
   async function createLabel(auth){
    const gmail = google.gmail({version:'v1',auth});
    try{
      const res =await gmail.users.labels.create({
        userId:'me',
        requestBody:{
          name:LABEL_NAME,
          labelListVisibility:'labelShow',
          messageListVisibility:'show',
        },
      });
      return res.data.id;
    }catch(err){
      if(err.code===409){
        //Label already exist
        const res = await gmail.users.labels.list({
          userId:'me',
        });
        const label = res.data.labels.find((label)=> label.name === LABEL_NAME);
        return label.id;
      }else{
        throw err;
      }
    }
   }


   //add label to a message and move it to the label folder
   async function addLabel(auth,message,labelId){
    const gmail = google.gmail({version:'v1',auth});
    await gmail.users.messages.modify({
      userId:'me',
      id:message.id,
      requestBody:{
        addLabelIds:[labelId],
        removeLabelIds:['INBOX'],
      },
    });
   }


   //Main function
   async function main(){

    //create a label for the app
    const labelId = await createLabel(auth);
    console.log(`Created or found label with id ${labelId}`);

    //Repeating the following steps in random interval
    setInterval(async()=>{
      //Get message that have no prior replies
      const messages = await getUnrepliedMessages(auth);
      console.log(`Found ${messages.length} unreplied messages`);

      //for each message
      for(const message of messages){
        //send reply to the messages
        await sendReply(auth,message);
        console.log(`Sent reply to message with id ${message.id}`);

        //Add label to the message and move it to the label folder
        await addLabel(auth,message,labelId);
        console.log(`Added label to the message ${message.id}`);
      }
    },
    //setting interval in random 45-120 sec for automatic checking and message reply
    Math.floor(Math.random()*(120-45+1)+45)*1000 
    ); 
   }
   main().catch(console.error);


//getting the list of user labels
const labels = response.data.labels;
res.send("You have successfully subscribed to our services.");

});

//Creating a express server here which is listening to the port 3000
//we can also use env here but for simplification used directly
app.listen(3000,()=>{
  console.log(`Automail app listening at http://localhost:3000`);
})
