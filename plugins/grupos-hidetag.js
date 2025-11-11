let handler = async (m, { conn }) => {
  try {
    if (!m.isGroup)
      return conn.reply(m.chat, '⚠️ Este comando solo funciona en grupos.', m);

    // Extraer texto después de .n
    const body = m.text || '';
    const text = body.replace(/^(\.n|n)\s*/i, '').trim();

    // Info del grupo
    const groupMetadata = await conn.groupMetadata(m.chat);
    const participants = groupMetadata.participants.map(p => p.id);
    const botNumber = conn.user?.id || conn.user?.jid;
    const mentions = participants.filter(id => id !== botNumber);

    // Detectar si hay mensaje citado válido
    const quoted = (m.quoted && (m.quoted.fakeObj || m.quoted)) || null;

    if (quoted) {
      await conn.sendMessage(m.chat, {
        text: '📣 *Notificación:* mensaje reenviado',
        mentions
      }, { quoted: m });

      // Reenviar el mensaje citado
      await conn.sendMessage(m.chat, { forward: quoted }, { quoted: m });

      // Si hay texto adicional, lo mandamos como caption (pegado a la imagen/video)
      if (text.length > 0) {
        try {
          // Intentar editar el mensaje reenviado agregando caption
          await conn.sendMessage(m.chat, { text }, { quoted: quoted });
        } catch {
          // Si no se puede como caption, lo manda aparte
          await conn.sendMessage(m.chat, { text }, { quoted: m });
        }
      }
      return;
    }

    // Si no hay mensaje citado pero sí texto
    if (text.length > 0) {
      await conn.sendMessage(m.chat, {
        text: '📣 *Notificación:* mensaje reenviado',
        mentions
      }, { quoted: m });

      await conn.sendMessage(m.chat, { text }, { quoted: m });
      return;
    }

    // Si no hay texto ni mensaje
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