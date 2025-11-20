import fs from 'fs'
import path from 'path'

const handler = async (msg, { conn }) => {
  const chatId = msg.key.remoteJid

  if (!chatId || !chatId.endsWith("@g.us")) {
    return conn.sendMessage(chatId, {
      text: "❌ Este comando solo funciona en grupos."
    }, { quoted: msg })
  }

  try {
    const metadata = await conn.groupMetadata(chatId)
    const botNumber = conn.user.id
    const botInfo = metadata.participants.find(p => p.id === botNumber)

    if (!botInfo || !botInfo.admin) {
      return conn.sendMessage(chatId, {
        text: "🚫 Para obtener el link y la foto, necesito ser *administrador*. Aún no."
      }, { quoted: msg })
    }

    const code = await conn.groupInviteCode(chatId)
    const link = `https://chat.whatsapp.com/${code}`

    let profilePicUrl

    try {
      profilePicUrl = await conn.profilePictureUrl(chatId, "image")
    } catch {
      profilePicUrl = null
    }

    if (profilePicUrl) {
      const picBuffer = await conn.getFile(profilePicUrl)

      await conn.sendMessage(chatId, {
        image: picBuffer.data,
        caption: `🔗 *Link del grupo:*\n${link}`
      }, { quoted: msg })

    } else {
      await conn.sendMessage(chatId, {
        text: `🔗 *Link del grupo:*\n${link}\n\n⚠️ El grupo no tiene foto o no se pudo obtener.`
      }, { quoted: msg })
    }

    await conn.sendMessage(chatId, {
      react: { text: "🔗", key: msg.key }
    })

  } catch (e) {
    await conn.sendMessage(chatId, {
      text: "⚠️ No se pudo obtener el enlace o la foto del grupo. Asegúrate que el bot sea admin."
    }, { quoted: msg })
  }
}

handler.command = ["linkgrupo"]
export default handler