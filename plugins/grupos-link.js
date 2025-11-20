import fetch from "node-fetch";

const handler = async (msg, { conn }) => {
  const chatId = msg.key.remoteJid;

  if (!chatId.endsWith("@g.us")) {
    return conn.sendMessage(chatId, {
      text: "❌ Este comando solo funciona en grupos."
    }, { quoted: msg });
  }

  try {
    const metadata = await conn.groupMetadata(chatId);

    const participants = metadata.participants || [];
    const botNumber = await conn.decodeJid(conn.user.id);
    const botData = participants.find(p => (p.id || p.jid) === botNumber);

    const botIsAdmin = botData && (botData.admin === "admin" || botData.admin === "superadmin");

    if (!botIsAdmin) {
      return conn.sendMessage(chatId, {
        text: "🚫 Para obtener el link y la foto, necesito ser *administrador*."
      }, { quoted: msg });
    }

    let pfp;
    try {
      pfp = await conn.profilePictureUrl(chatId, "image");
    } catch {
      pfp = null;
    }

    let buffer;

    if (pfp) {
      try {
        const res = await fetch(pfp);
        buffer = await res.buffer();
      } catch {
        buffer = null;
      }
    }

    if (!buffer) {
      const fallback = "https://i.ibb.co/4pDNDk1/empty.jpg";
      const res = await fetch(fallback);
      buffer = await res.buffer();
    }

    let code;
    try {
      code = await conn.groupInviteCode(chatId);
    } catch {
      return conn.sendMessage(chatId, {
        text: "⚠️ No pude generar el link. El grupo puede tener restricciones."
      }, { quoted: msg });
    }

    const link = `https://chat.whatsapp.com/${code}`;

    await conn.sendMessage(chatId, {
      image: buffer,
      caption: `🔗 *Link del grupo:*\n${link}`
    }, { quoted: msg });

    await conn.sendMessage(chatId, {
      react: { text: "🔗", key: msg.key }
    });

  } catch {
    await conn.sendMessage(chatId, {
      text: "❌ Error inesperado al obtener la información del grupo."
    }, { quoted: msg });
  }
};

handler.command = ["link"];
export default handler;