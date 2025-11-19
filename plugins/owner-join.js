import fetch from 'node-fetch';

let handler = async (m, { text, conn }) => {
  // Detectar si el mensaje menciona al bot o usa comandos
  const isTagged = m.mentionedJid?.includes(conn.user.jid) || false;
  const isCommand = /^[\.]?(bot|gemini)/i.test(m.text);

  if (!isTagged && !isCommand) return;

  // Extraer la consulta (elimina menciones/comandos)
  let query = m.text
    .replace(new RegExp(`@${conn.user.jid.split('@')[0]}`, 'i'), '') // Elimina @EliteBot
    .replace(/^[\.]?(bot|gemini)\s*/i, '') // Elimina comandos
    .trim();

  if (!query) throw `¡Hola!\nMi nombre es Elite Bot\n¿En qué te puedo ayudar? ♥️`;

  try {
    await conn.sendPresenceUpdate('composing', m.chat);
    const apiUrl = `https://apis-starlights-team.koyeb.app/starlight/gemini?text=${encodeURIComponent(query)}`;
    const res = await fetch(apiUrl);
    const data = await res.json();

    await m.reply(data.result || '🔴 Error en la API');
  } catch (e) {
    console.error(e);
    await m.reply('❌ Error al procesar');
  }
};

// Configuración universal
handler.customPrefix = /^(\.?bot|\.?gemini|@\d+)/i;
handler.command = new RegExp;
handler.tags = ['ai'];
export default handler;