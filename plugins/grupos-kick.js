const handler = async (m, { conn }) => {
  // Obtener todos los targets posibles:
  // - Menciones
  // - Citado
  let targets = [];

  if (m.mentionedJid?.length) {
    targets.push(...m.mentionedJid);
  }

  if (m.quoted?.sender) {
    targets.push(m.quoted.sender);
  }

  // Quitar duplicados
  targets = [...new Set(targets)];

  // Si no hubo nada
  if (!targets.length) {
    return conn.sendMessage(
      m.chat,
      { text: '⚠️ *Menciona o responde al usuario que deseas eliminar.*' },
      { quoted: m }
    );
  }

  try {
    // Intentar expulsar uno por uno
    for (const user of targets) {
      await conn.groupParticipantsUpdate(m.chat, [user], 'remove');
    }

    await conn.sendMessage(
      m.chat,
      { text: `✅ *Se eliminaron ${targets.length} usuario(s)*` },
      { quoted: m }
    );

  } catch (err) {
    console.error(err);
    return global.dfail('botAdmin', m, conn);
  }
};

handler.customPrefix = /^(?:\.?kick)(?:\s+|$)/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;