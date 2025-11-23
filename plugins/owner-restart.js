let handler = async (m, { conn, usedPrefix, command }) => {

    try {
        m.reply('「🏜️」 Reiniciando El Bot....')
        setTimeout(() => {
            process.exit(0)
        }, 3000) 
    } catch (error) {
        console.log(error)
        conn.reply(m.chat, `${error}`, m)
    }
}

handler.command = ['rei', 'restart'] 
handler.rowner = false

export default handler