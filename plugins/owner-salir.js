let handler = async (m, { conn, text, command }) => {
  let id = text ? text : m.chat
  let mensaje = '𝙲𝚘́𝚖𝚘 𝚝𝚞́ 𝙿𝚊𝚙𝚊́, 𝚃𝚎 𝚊𝚋𝚊𝚗𝚍𝚘𝚗𝚘 🏃🏻‍♂️ baki Bot'
  await conn.sendMessage(m.chat, { text: mensaje, mentions: [m.sender] }, { quoted: m })
  await conn.groupLeave(id)
}
handler.help = ['salir']
handler.tags = ['owner']
handler.command = /^(salir)$/i
handler.group = true
handler.owner = true

export default handler