// 📌 REGISTRO DE ACTIVIDAD DE MENSAJES
let messageHandler = async (m, { conn }) => {
    if (!m.sender || !m.isGroup) return

    // Asegura que el usuario existe
    if (!global.db.data.users[m.sender]) {
        global.db.data.users[m.sender] = {}
    }

    let userData = global.db.data.users[m.sender]

    // Asegura que exista 'groups'
    if (!userData.groups) userData.groups = {}

    // Asegura que exista el registro del grupo actual
    if (!userData.groups[m.chat]) {
        userData.groups[m.chat] = {}
    }

    // 🕒 Guarda la fecha del último mensaje del usuario en este grupo
    userData.groups[m.chat].lastMessage = Date.now()

    // Guarda cambios
    global.db.data.users[m.sender] = userData
}

// 📌 COMANDO verfantasmas / fankick
let handler = async (m, { conn, participants, command }) => {
    const DIAS_INACTIVO = 3
    const tiempoInactivo = DIAS_INACTIVO * 24 * 60 * 60 * 1000
    const ahora = Date.now()

    let miembros = participants.map(v => v.id)
    let fantasmas = []
    
    for (let usuario of miembros) {

        // ❌ No contar al bot
        if (usuario === conn.user.jid) continue

        // ❌ No contar admins
        let infoParticipante = participants.find(p => p.id === usuario)
        let esAdmin = infoParticipante?.admin || infoParticipante?.isAdmin || infoParticipante?.isSuperAdmin
        if (esAdmin) continue

        // Datos del usuario
        let dataUser = global.db.data.users[usuario]
        let dataGrupo = dataUser?.groups?.[m.chat]

        let ultimaActividad = dataGrupo?.lastMessage || 0

        // Si lleva más de X días sin hablar
        if (ahora - ultimaActividad > tiempoInactivo) {
            fantasmas.push(usuario)
        }
    }

    // Si no hay fantasmas
    if (fantasmas.length === 0) {
        return conn.reply(m.chat, `*[❗INFO❗]* Este grupo no tiene usuarios inactivos.`, m)
    }

    // Expulsar
    if (command === 'fankick') {
        await conn.groupParticipantsUpdate(m.chat, fantasmas, 'remove')
        let eliminados = fantasmas.map(v => '@' + v.replace(/@.+/, '')).join('\n')
        return conn.reply(m.chat, `*Fantasmas eliminados:*\n${eliminados}`, null, { mentions: fantasmas })
    }

    // Mostrar lista
    let mensaje = `[ ⚠ 𝙍𝙀𝙑𝙄𝙎𝙄𝙊𝙉 𝙄𝙉𝘼𝘾𝙏𝙄𝙑𝘼 ⚠ ]\n\n`
    mensaje += `𝐆𝐑𝐔𝐏𝐎: ${await conn.getName(m.chat)}\n`
    mensaje += `𝐌𝐈𝐄𝐌𝐁𝐑𝐎𝐒: ${miembros.length}\n\n`
    mensaje += `⇲ 𝙁𝘼𝙉𝙏𝘼𝙎𝙈𝘼𝙎 𝘿𝙀 𝟑 𝘿𝙄𝘼𝙎 ⇱\n`
    mensaje += fantasmas.map(v => '  👻 @' + v.replace(/@.+/, '')).join('\n')
    mensaje += `\n\n*_Los usuarios que no hablen serán eliminados_*\n\n`
    mensaje += `🧹 Para eliminar fantasmas usa:\n.fankick`

    conn.reply(m.chat, mensaje, null, { mentions: fantasmas })
}

handler.help = ['fantasmas', 'fankick']
handler.tags = ['group']
handler.command = /^(verfantasmas|fantasmas|sider|fankick)$/i
handler.admin = true

export { messageHandler }
export default handler