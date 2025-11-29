import fetch from "node-fetch";

const handler = async (m, { conn }) => {
  const chat = m.chat;

  // Validación
  if (!chat.endsWith("@g.us")) {
    return conn.sendMessage(chat, {
      text: "❌ Este comando solo funciona en *grupos*."
    }, { quoted: m });
  }

  try {
    // Obtener código del enlace
    const inviteCode = await conn.groupInviteCode(chat).catch(() => null);

    if (!inviteCode) {
      return conn.sendMessage(chat, {
        text: "🚫 Necesito ser *administrador* para obtener el link del grupo."
      }, { quoted: m });
    }

    // Obtener metadata
    const data = await conn.groupMetadata(chat);
    const groupName = data.subject || "Grupo sin nombre";
    const link = `https://chat.whatsapp.com/${inviteCode}`;

    // Obtener foto del grupo
    let ppBuffer;
    try {
      const imgUrl = await conn.profilePictureUrl(chat, "image");
      const res = await fetch(imgUrl);
      ppBuffer = await res.buffer();
    } catch {
      // Fallback si no existe foto
      const fallback = "https://files.catbox.moe/xr2m6u.jpg";
      const res = await fetch(fallback);
      ppBuffer = await res.buffer();
    }

    // Mensaje final optimizado
    const caption = 
`*📌 Nombre del grupo:*  
${groupName}

*🔗 Enlace de invitación:*  
${link}

──────────────
_Enviado por el bot_`;

    await conn.sendMessage(chat, {
      image: ppBuffer,
      caption
    }, { quoted: m });

    await conn.sendMessage(chat, {
      react: { text: "🔗", key: m.key }
    });

  } catch (err) {
    console.error("❌ Error en .link:", err);
    await conn.sendMessage(chat, {
      text: "⚠️ Ocurrió un error inesperado al obtener el link del grupo."
    }, { quoted: m });
  }
};

// Datos del comando
handler.help = ["link", "enlace"];
handler.tags = ["grupo"];
handler.command = /^link|enlace$/i;
handler.group = true;
handler.admin = true;

export default handler;