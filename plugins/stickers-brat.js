const handler = async (m, { conn, text }) => {
  // Si no hay texto, intentamos usar el del mensaje citado
  if (!text && m.quoted?.text) {
    text = m.quoted.text
  }

  if (!text) {
    return m.reply(
      `𝖠𝗀𝗋𝖾𝗀𝖺 𝖳𝖾𝗑𝗍𝗈 𝖮 𝖱𝖾𝗌𝗉𝗈𝗇𝖽𝖾 𝖠 𝖴𝗇 𝖬𝖾𝗇𝗌𝖺𝗃𝖾 𝖯𝖺𝗋𝖺 𝖢𝗋𝖾𝖺𝗋 𝖤𝗅 𝖲𝗍𝗂𝖼𝗄𝖾𝗋 𝖡𝗋𝖺𝗍`,
      global.rcanal
    )
  }

  try {
    await conn.sendMessage(m.chat, { react: { text: "🕒", key: m.key } })

    const url = `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(text)}`

    // === ENTREGA DEL STICKER + global.rcanal ===
    await conn.sendMessage(
      m.chat,
      {
        sticker: { url },
        packname: "",
        author: "",
        ...global.rcanal
      },
      { quoted: m }
    )

    await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } })

  } catch (e) {
    console.error(e)

    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } })

    // === MENSAJE DE ERROR + global.rcanal ===
    conn.reply(
      m.chat,
      '❌ *𝙴𝚛𝚛𝚘𝚛 𝙰𝚕 𝙶𝚎𝚗𝚎𝚛𝚊𝚛 𝚎𝚕 𝚂𝚝𝚒𝚌𝚔𝚎𝗋*.',
      m,
      global.rcanal
    )
  }
}

handler.command = /^brat$/i
handler.help = ["brat <texto>"]
handler.tags = ["sticker"]

export default handler