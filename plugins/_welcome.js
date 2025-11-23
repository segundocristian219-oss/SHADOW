import { WAMessageStubType } from '@whiskeysockets/baileys'

// Caché temporal en RAM:
const ppCache = new Map()
const CACHE_TTL = 60 * 1000 // 1 minuto

async function getProfilePic(conn, jid) {
  const cached = ppCache.get(jid)

  // Si existe en caché y no está expirado, lo regresamos
  if (cached && (Date.now() - cached.time < CACHE_TTL)) {
    return cached.url
  }

  let url
  try {
    url = await conn.profilePictureUrl(jid, 'image')
  } catch {
    try {
      url = await conn.profilePictureUrl(jid, 'preview')
    } catch {
      url = 'https://cdn.russellxz.click/262f94ad.jpeg'
    }
  }

  // Guardar en caché
  ppCache.set(jid, {
    url,
    time: Date.now()
  })

  return url
}


export async function before(m, { conn, participants, groupMetadata }) {
  if (!m.messageStubType || !m.isGroup) return true

  const chat = global.db.data.chats[m.chat]
  if (chat.bienvenida === undefined) chat.bienvenida = true

  const userJid = m.messageStubParameters[0]
  const user = `@${userJid.split('@')[0]}`
  const groupName = groupMetadata.subject
  const groupDesc = groupMetadata.desc || 'Sin descripción'

  // Obtener foto optimizada con fallback
  const profilePic = await getProfilePic(conn, userJid)

  // ───────────────────────
  // 👋 BIENVENIDA
  // ───────────────────────
  if (chat.bienvenida && m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_ADD) {

    const welcome = chat.sWelcome
      ? chat.sWelcome
          .replace(/@user/g, user)
          .replace(/@group/g, groupName)
          .replace(/@desc/g, groupDesc)
      : `┊» 𝙋𝙊𝙍 𝙁𝙄𝙉 𝙇𝙇𝙀𝗚𝗔𝗦
┊» ${groupName}
┊» ${user}
┊» 𝗹𝗲𝗲 𝗹𝗮 𝗱𝗲𝘀𝗰𝗿𝗶𝗽𝗰𝗶𝗼𝗻

» Siéntete como en tu casa, aplasta el culo!!!`

    await conn.sendMessage(m.chat, {
      image: { url: profilePic },
      caption: welcome,
      mentions: [userJid]
    })
  }

  // ───────────────────────
  // 👿 DESPEDIDA (Leave o Removed)
  // ───────────────────────
  if (
    chat.bienvenida &&
    (m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_LEAVE ||
     m.messageStubType === WAMessageStubType.GROUP_PARTICIPANT_REMOVE)
  ) {

    const msgsBye = [
      `*╭┈┈┈┈┈┈┈┈┈┈┈┈┈≫*
*┊* ${user}
*┊𝗧𝗨 𝗔𝗨𝗦𝗘𝗡𝗖𝗜𝗔 𝗙𝗨𝗘 𝗖𝗢𝗠𝗢 𝗨𝗡 𝗤𝗟𝗢,*
*┊𝗖𝗢𝗡 𝗢𝗟𝗢𝗥 𝗔 𝗠𝗥𝗗!!* 👿
*╰┈┈┈┈┈┈┈┈┈┈┈┈┈≫*`,

      `*╭┈┈┈┈┈┈┈┈┈┈┈┈┈≫*
*┊* ${user}
*┊𝗔𝗟𝗚𝗨𝗜𝗘𝗡 𝗠𝗘𝗡𝗢𝗦, 𝗤𝗨𝗜𝗘𝗡 𝗧𝗘 𝗥𝗘𝗖𝗨𝗘𝗥𝗗𝗘*
*┊𝗦𝗘𝗥𝗔 𝗣𝗢𝗥 𝗟𝗔𝗦𝗧𝗜𝗠𝗔, 𝗔𝗗𝗜𝗢𝗦!!* 👿
*╰┈┈┈┈┈┈┈┈┈┈┈┈┈≫*`,

      `*╭┈┈┈┈┈┈┈┈┈┈┈┈┈≫*
*┊* ${user}
*┊𝗧𝗨 𝗗𝗘𝗦𝗣𝗘𝗗𝗜𝗗𝗔 𝗡𝗢𝗦 𝗛𝗔𝗥𝗔 𝗟𝗟𝗢𝗥𝗔𝗥,*
*┊𝗗𝗘 𝗟𝗔 𝗩𝗘𝗥𝗚𝗨𝗘𝗡𝗭𝗔 𝗤𝗨𝗘 𝗗𝗔𝗕𝗔𝗦!!* 👿
*╰┈┈┈┈┈┈┈┈┈┈┈┈┈≫*`,

      `*╭┈┈┈┈┈┈┈┈┈┈┈┈┈≫*
*┊* ${user}
*┊𝗗𝗘𝗝𝗢 𝗗𝗘 𝗢𝗟𝗘𝗥 𝗔 𝗠𝗥𝗗,*
*┊𝗛𝗔𝗦𝗧𝗔 𝗤𝗨𝗘 𝗧𝗘𝗟𝗔𝗥𝗚𝗔𝗦𝗧𝗘!!* 👿
*╰┈┈┈┈┈┈┈┈┈┈┈┈┈≫*`
    ]

    const bye = chat.sBye
      ? chat.sBye
          .replace(/@user/g, user)
          .replace(/@group/g, groupName)
          .replace(/@desc/g, groupDesc)
      : msgsBye[Math.floor(Math.random() * msgsBye.length)]

    await conn.sendMessage(m.chat, {
      image: { url: profilePic },
      caption: bye,
      mentions: [userJid]
    })
  }

  return true
}