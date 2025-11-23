import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { promisify } from "util";
import { pipeline } from "stream";

const streamPipe = promisify(pipeline);
const TMP_DIR = path.join(process.cwd(), "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const SKY_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click";
const SKY_KEY  = process.env.API_KEY  || "Russellxz";
const MAX_FILE_MB = 99;

function safeUnlink(file){ try{ fs.existsSync(file)&&fs.unlinkSync(file) }catch{} }

async function convertToMp3(inputFile){
    const outFile = inputFile.replace(path.extname(inputFile),".mp3");
    await new Promise((resolve,reject)=> ffmpeg(inputFile)
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .format("mp3")
        .on("end",resolve)
        .on("error",reject)
        .save(outFile));
    safeUnlink(inputFile);
    return outFile;
}

function isYouTube(url){ return /^https?:\/\//i.test(url) && /(youtube\.com|youtu\.be)/i.test(url) }

async function getSkyMedia(videoUrl, format){
    const endpoints = ["/api/download/yt.php","/api/download/yt.js"];
    for(const ep of endpoints){
        try{
            const {data} = await axios.get(`${SKY_BASE}${ep}`,{
                params:{url:videoUrl,format},
                headers:{Authorization:`Bearer ${SKY_KEY}`},
                validateStatus:()=>true
            });
            const url = data?.data?.video || data?.data?.audio || data?.video || data?.audio;
            if(url) return { mediaUrl: url, meta: data.data };
        }catch{}
    }
    throw new Error("No se pudo obtener el media de Sky API");
}

async function sendFile(conn,chatId,filePath,title,type,isDoc,quoted){
    if(!fs.existsSync(filePath)) return conn.sendMessage(chatId,{text:"❌ Archivo inválido."},{quoted});
    const buffer = fs.readFileSync(filePath);
    const msg = {};
    if(isDoc) msg.document = buffer;
    else if(type==="audio") msg.audio = buffer;
    else msg.video = buffer;
    const mimetype = type==="audio"?"audio/mpeg":"video/mp4";
    const fileName = `${title}.${type==="audio"?"mp3":"mp4"}`;
    await conn.sendMessage(chatId,{...msg,mimetype,fileName},{quoted});
}

async function handleDownload(conn,chatId,videoUrl,title,choice,quoted){
    const map = {"👍":"audio","❤️":"video","📄":"audioDoc","📁":"videoDoc"};
    const key = map[choice]; if(!key) return;
    const type = key.startsWith("audio")?"audio":"video";
    const isDoc = key.endsWith("Doc");

    const { mediaUrl } = await getSkyMedia(videoUrl,type);
    if(!mediaUrl) return conn.sendMessage(chatId,{text:`❌ No se obtuvo enlace de ${type}`},{quoted});

    const fileExt = type==="audio"?"mp3":"mp4";
    let tmpFile = path.join(TMP_DIR,`${crypto.randomUUID()}_${key}.${fileExt}`);

    const { data } = await axios.get(mediaUrl,{responseType:"stream"});
    await streamPipe(data,fs.createWriteStream(tmpFile));

    if(type==="audio" && fileExt!=="mp3") tmpFile = await convertToMp3(tmpFile);

    if(fs.existsSync(tmpFile) && fs.statSync(tmpFile).size/(1024*1024)>MAX_FILE_MB){
        safeUnlink(tmpFile);
        return conn.sendMessage(chatId,{text:"❌ Archivo muy grande"},{quoted});
    }

    await sendFile(conn,chatId,tmpFile,title,type,isDoc,quoted);
}

const handler = async(msg,{conn,args,command})=>{
    const jid = msg.key.remoteJid;
    const text = args.join(" ").trim();
    const pref = global.prefixes?.[0]||".";

    if(!text) return conn.sendMessage(jid,{text:`✳️ Usa:\n${pref}${command} <link>\nEj: ${pref}${command} https://youtu.be/xxxxxx`},{quoted:msg});
    if(!isYouTube(text)) return conn.sendMessage(jid,{text:"❌ URL de YouTube inválida."},{quoted:msg});

    const caption =
`🎵 YouTube Link
🌐 Link: ${text}

📥 Reacciona para descargar:
☛ 👍 Audio MP3
☛ ❤️ Video MP4
☛ 📄 Audio Doc
☛ 📁 Video Doc`;

    const preview = await conn.sendMessage(jid,{image:{url:"https://i.imgur.com/8k1e1kK.png"},caption},{quoted:msg});

    pendingManagerAdd(preview.key.id,{chatId:jid,videoUrl:text,title:"YouTube Video",commandMsg:msg,sender:msg.key.participant||msg.participant,downloading:false});

    if(conn._playListener) conn.ev.off("messages.upsert",conn._playListener);
    conn._playListener = async ev=>{
        for(const m of ev.messages||[]){
            const react = m.message?.reactionMessage; if(!react) continue;
            const { key:reactKey, text:emoji, sender } = react;
            const job = pendingManagerGet(reactKey?.id);
            if(!job || !["👍","❤️","📄","📁"].includes(emoji)) continue;
            if((sender||m.key.participant)!==job.sender){ await conn.sendMessage(job.chatId,{text:"❌ No autorizado."},{quoted:job.commandMsg}); continue; }
            if(job.downloading) continue;
            job.downloading=true;
            try{
                await conn.sendMessage(job.chatId,{text:`⏳ Descargando...`},{quoted:job.commandMsg});
                await handleDownload(conn,job.chatId,job.videoUrl,job.title,emoji,job.commandMsg);
            } finally{ job.downloading=false }
        }
    };
    conn.ev.on("messages.upsert",conn._playListener);
}

const pending = {};
function pendingManagerAdd(id,data){ pending[id]=data; setTimeout(()=>delete pending[id],10*60*1000) }
function pendingManagerGet(id){ return pending[id] }

handler.command = ["ytlink","ytmp4"];
export default handler;