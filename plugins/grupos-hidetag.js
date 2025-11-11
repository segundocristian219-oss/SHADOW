let handler = async (m, { conn }) => {
  try {
    if (!m.isGroup)
      return conn.reply(m.chat, '⚠️ Este comando solo funciona en grupos.', m);

    // Texto después del .n
    const body = m.text || '';
    const text = body.replace(/^(\.n|n)\s*/i, '').trim();

    // Info del grupo
    const groupMetadata = await conn.groupMetadata(m.chat);
    const participants = groupMetadata.participants.map(p => p.id);
    const botNumber = conn.user?.id || conn.user?.jid;
    const mentions = participants.filter(id => id !== botNumber);

    // === CASO 1: Si citó un mensaje (imagen, texto, video, sticker, etc.) ===
    if (m.quoted) {
      await conn.sendMessage(m.chat, {
        text: '📣 *Notificación:* mensaje reenviado',
        mentions
      }, { quoted: m });

      // Reenviamos tal cual el mensaje citado
      await conn.copyNForward(m.chat, m.quoted.fakeObj || m.quoted, true);
      return;
    }

    // === CASO 2: Si solo puso texto (.n hola) ===
    if (text.length > 0) {
      await conn.sendMessage(m.chat, {
        text: '📣 *Notificación:* mensaje reenviado',
        mentions
      }, { quoted: m });

      await conn.sendMessage(m.chat, {
        text
      }, { quoted: m });
      return;
    }

    // === CASO 3: Nada ===
    await conn.reply(m.chat, '❌ No hay nada para reenviar.', m);

  } catch (err) {
    console.error('Error en .n:', err);
    await conn.reply(m.chat, '❌ Ocurrió un error al reenviar.\n' + err.message, m);
  }
};

handler.customPrefix = /^(\.n|n)(\s|$)/i;
handler.command = new RegExp();
handler.group = true;
export default handler;