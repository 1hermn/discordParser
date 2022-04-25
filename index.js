import axios from 'axios';
import HttpsProxyAgent from 'http-proxy-agent'
import { Telegraf } from 'telegraf'
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config()

const folders = await fs.readdirSync("./servers")

let servers = []

for(let file of folders) {
  if(file.endsWith(".json")) {
    const server = JSON.parse(String(await fs.readFileSync("./servers/" + file)))
    servers.push({
      name: file.split(".")[0],
      channels: server
    })
  }
}

async function login() {
  const str = ("194.4.49.229:24531:hzkupp:t73j8Ryucu").split(":")
  const agent = new HttpsProxyAgent(`http://${str[2]}:${str[3]}@${str[0]}:${str[1]}`);

  const mainframe = axios.create(
    {
      baseURL: "https://discord.com/api/", headers: {
        authorization: process.env.discord_TOKEN
      },
      httpAgent: agent
    });
  const user = await mainframe.get('users/@me')
  mainframe.defaults.headers.Cookie = user.headers["set-cookie"];
  console.log("Logged is as ", user.data.username)
  return mainframe
}


async function getMessages(channel, last, mainframe, name, server){
  const url = `v9/channels/${channel}/messages?limit=50`
  const { data } = await mainframe.get(url)
  let tag = "#" + name
  let messages = []
  for(let message of data){
    if(Number(message.id) > Number(last)){
      if(message.content === ''){
        if(typeof message.embeds[0] !== "undefined") {
          messages.push("`" + tag + "`\n\n" + `${message.embeds[0].description}`)
        }else {
          if(typeof message.attachments[0] !== "undefined"){
            let msg = "`" + tag + "`\n\n"
            for(let attach of message.attachments){
              msg += msg + `[Прикреплено](${attach.url})\n`
            }
            messages.push(msg)
          }
        }
      }else {
        let msg = ""
        if(typeof message.attachments[0] !== "undefined"){
          for(let attach of message.attachments){
            msg += msg + `[Прикреплено](${attach.url})\n`
          }
          messages.push(msg)
        }
        const regex = new RegExp("<.*?>")
        messages.push("`" + tag + "`\n\n" + `${message.content.replace(regex, "t")}\n` + msg)
      }
    }
  }
  last = data[0].id
  server.channels[1][name] = last
  return messages
}
const mainframe = await login()
const bot = new Telegraf(process.env.tgBotToken)

bot.launch().then(async e => {
  await parseAllMessages()
  setInterval(async () => {
    await parseAllMessages()
  }, 1000 * 60)
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseAllMessages(){
  for(let server of servers){
    const name = server.name
    let i = 0;
    for(let key in server.channels[0]){
      try {
        const data = await getMessages(server.channels[0][key], server.channels[1][key], mainframe, key,server)
        if (typeof data[0] !== "undefined") {
          for(let message of data){
            await sleep((i++)*1000)
            await bot.telegram.sendMessage(process.env.tgChannelId, "`" + name +"`\n\n\n" +  message, {
              parse_mode: "Markdown"
            })
          }
        } else {
          console.log(key, "Nothing interesting")
        }
      }catch (e) {
        console.log("Error with ", key)
        console.log(e)
      }
    }
    await fs.writeFileSync("./servers/" + name + ".json", JSON.stringify(server.channels, null, 4))
  }

}