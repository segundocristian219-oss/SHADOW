let handler = async (m, { conn }) => {
if (!m.quoted) 
return conn.reply(m.chat, `🧹 *𝚁𝚎𝚜𝚙𝚘𝚗𝚍𝚎 𝙰𝚕 𝚖𝚎𝚗𝚜𝚊𝚓𝚎 𝚚𝚞𝚎 𝚍𝚎𝚜𝚎𝚊𝚜 𝙴𝚕𝚒𝚖𝚒𝚗𝚊𝚛*.`, m.key);

try {
let delet = m.message.extendedTextMessage?.contextInfo?.participant;
let bang = m.message.extendedTextMessage?.contextInfo?.stanzaId;

if (bang && delet) {
await conn.sendMessage(m.chat, { 
delete: { remoteJid: m.chat, fromMe: false, id: bang, participant: delet } 
});
} else {
await conn.sendMessage(m.chat, { 
delete: { remoteJid: m.chat, fromMe: true, id: m.quoted.key.id } 
});
}

await conn.sendMessage(m.chat, {
react: {
text: '✅',
key: m.key
}
});

} catch (e) {
console.error(e);
conn.reply(m.chat, '❌ *𝙽𝚘 𝚂𝚎 𝚙𝚞𝚍𝚘 𝚎𝚕𝚒𝚖𝚒𝚗𝚊𝚛 𝚎𝚕 𝙼𝚎𝚗𝚜𝚊𝚓𝚎*.', m.key);
}
}

handler.customPrefix = /^\.?(del|delete)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;