import fetch from "node-fetch";

const handler = async (m, { conn }) => {
  const chat = m.chat;

  if (!chat.endsWith("@g.us")) {
    return conn.sendMessage(chat, {
      text: "❌ Este comando solo funciona en *grupos*."
    }, { quoted: m });
  }

  try {
    // --- Obtener link rápido ---
    const inviteCode = await conn.groupInviteCode(chat);
    const link = `https://chat.whatsapp.com/${inviteCode}`;

    // --- Metadata del grupo ---
    const data = await conn.groupMetadata(chat);
    const groupName = data.subject || "Grupo";

    // --- Obtener foto de manera inteligente ---
    let ppBuffer;

    try {
      const imgUrl = await conn.profilePictureUrl(chat, "image");
      const res = await fetch(imgUrl, { timeout: 6000 });
      ppBuffer = await res.buffer();
    } catch {
      // fallback rápido y liviano
      const fallback = "https://files.catbox.moe/xr2m6u.jpg";
      const res = await fetch(fallback);
      ppBuffer = await res.buffer();
    }

    // --- Caption optimizado ---
    const caption =
`*📌 Nombre del grupo:*  
${groupName}

*🔗 Enlace de invitación:*  
${link}

──────────────
_Enviado por el bot_`;

    // --- Envio más rápido posible ---
    await conn.sendMessage(chat, {
      image: ppBuffer,
      caption
    }, { quoted: m });

    // --- Reacción ---
    conn.sendMessage(chat, {
      react: { text: "🔗", key: m.key }
    });

  } catch (err) {
    console.error("❌ Error en .link:", err);
    await conn.sendMessage(chat, {
      text: "⚠️ No se pudo obtener el link del grupo. ¿El bot es administrador?"
    }, { quoted: m });
  }
};

// Datos del comando
handler.help = ["link", "enlace"];
handler.tags = ["grupo"];
handler.command = /^(link|enlace)$/i;
handler.group = true;
handler.admin = false;

export default handler;