import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const handler = async (msg, { conn, command }) => {
  const chatId = msg.key.remoteJid;
  const pref = global.prefixes?.[0] || ".";

  // 📌 Detectar si viene un archivo directo o citado
  let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  let mediaMessage = null;
  let typeDetected = null;

  // 🔹 Si no hay quoted, intentamos detectar en el mismo mensaje
  if (!quoted) {
    if (msg.message?.imageMessage) {
      typeDetected = 'image';
      mediaMessage = msg.message.imageMessage;
    } else if (msg.message?.videoMessage) {
      typeDetected = 'video';
      mediaMessage = msg.message.videoMessage;
    } else if (msg.message?.stickerMessage) {
      typeDetected = 'sticker';
      mediaMessage = msg.message.stickerMessage;
    } else if (msg.message?.audioMessage) {
      typeDetected = 'audio';
      mediaMessage = msg.message.audioMessage;
    }
  } else {
    if (quoted.imageMessage) {
      typeDetected = 'image';
      mediaMessage = quoted.imageMessage;
    } else if (quoted.videoMessage) {
      typeDetected = 'video';
      mediaMessage = quoted.videoMessage;
    } else if (quoted.stickerMessage) {
      typeDetected = 'sticker';
      mediaMessage = quoted.stickerMessage;
    } else if (quoted.audioMessage) {
      typeDetected = 'audio';
      mediaMessage = quoted.audioMessage;
    }
  }

  if (!mediaMessage) {
    return conn.sendMessage(chatId, {
      text: `🏞️ *𝚁𝚎𝚜𝚙𝚘𝚗𝚍𝚎 𝚊 𝚞𝚗𝚊 𝙸𝚖𝚊𝚐𝚎𝚗, 𝚅𝚒𝚍𝚎𝚘 𝚘 𝙰𝚞𝚍𝚒𝚘 𝚙𝚊𝚛𝚊 𝚂𝚞𝚋𝚒𝚛 𝚎𝚕 𝚞𝚛𝚕*.`
    }, { quoted: msg });
  }

  await conn.sendMessage(chatId, { react: { text: '☁️', key: msg.key } });

  try {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    const rawExt = typeDetected === 'sticker' ? 'webp' :
      mediaMessage.mimetype ? mediaMessage.mimetype.split('/')[1].split(';')[0] : 'bin';

    const rawPath = path.join(tmpDir, `${Date.now()}_input.${rawExt}`);
    const stream = await downloadContentFromMessage(mediaMessage, typeDetected === 'sticker' ? 'sticker' : typeDetected);
    const writeStream = fs.createWriteStream(rawPath);
    for await (const chunk of stream) writeStream.write(chunk);
    writeStream.end();
    await new Promise(resolve => writeStream.on('finish', resolve));

    const stats = fs.statSync(rawPath);
    if (stats.size > 200 * 1024 * 1024) {
      fs.unlinkSync(rawPath);
      throw new Error('⚠️ *𝙴𝚕 𝙰𝚛𝚌𝚑𝚒𝚟𝚘 𝚎𝚜 𝚖𝚞𝚢 𝙶𝚛𝚊𝚗𝚍𝚎*.');
    }

    let finalPath = rawPath;
    if (typeDetected === 'audio' && ['ogg', 'm4a', 'mpeg'].includes(rawExt)) {
      finalPath = path.join(tmpDir, `${Date.now()}_converted.mp3`);
      await new Promise((resolve, reject) => {
        ffmpeg(rawPath)
          .audioCodec('libmp3lame')
          .toFormat('mp3')
          .on('end', resolve)
          .on('error', reject)
          .save(finalPath);
      });
      fs.unlinkSync(rawPath);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(finalPath));
    const res = await axios.post('https://cdn.russellxz.click/upload.php', form, {
      headers: form.getHeaders(),
    });

    fs.unlinkSync(finalPath);

    if (!res.data || !res.data.url) throw new Error('❌ *𝙽𝚘 𝚂𝚎 𝚙𝚞𝚍𝚘 𝚜𝚞𝚋𝚒𝚛 𝚎𝚕 𝙰𝚛𝚌𝚑𝚒𝚟𝚘*.');

    await conn.sendMessage(chatId, {
      text: `➤ 𝖮𝖱𝖣𝖤𝖭 𝖤𝖩𝖤𝖢𝖴𝖳𝖠𝖣𝖠 ✅

𝖠𝖱𝖢𝖧𝖨𝖵𝖮 𝖲𝖴𝖡𝖨𝖣𝖮 𝖢𝖮𝖱𝖱𝖤𝖢𝖳𝖠𝖬𝖤𝖭𝖳𝖤. 𝖠𝖰𝖴𝖨 𝖳𝖨𝖤𝖭𝖤 𝖲𝖴 𝖴𝖱𝖫:\n${res.data.url}`
    }, { quoted: msg });

    await conn.sendMessage(chatId, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error("❌ Error en .tourl:", err);
    await conn.sendMessage(chatId, { text: `❌ *Error:* ${err.message}` }, { quoted: msg });
    await conn.sendMessage(chatId, { react: { text: '❌', key: msg.key } });
  }
};

handler.command = ['tl', 'tourl'];
handler.help = ['𝖳𝗈𝗎𝗋𝗅'];
handler.tags = ['𝖳𝗈𝗈𝗅𝗌'];

export default handler;