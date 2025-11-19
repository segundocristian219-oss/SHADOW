import qrcode from "qrcode"
import NodeCache from "node-cache"
import fs from "fs"
import path from "path"
import pino from "pino"
import chalk from "chalk"
import util from "util"
import * as ws from "ws"
import { fileURLToPath } from "url"
import { exec as _exec } from "child_process"

const { CONNECTING } = ws

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const crm1 = "Y2QgcGx1Z2lucy"
const crm2 = "A7IG1kNXN1b"
const crm3 = "SBpbmZvLWRvbmFyLmpz"
const crm4 = "IF9hdXRvcmVzcG9uZGVyLmpzIGluZm8tYm90Lmpz"
let drm1 = ""
let drm2 = ""
const rtx = `
✦ 𝗩𝗶𝗻𝗰𝘂𝗹𝗮𝗰𝗶́𝗼𝗻 𝗽𝗼𝗿 𝗖𝗼́𝗱𝗶𝗴𝗼 𝗤𝗥 ✦

> No te olvides *_Seguirme_*: https://whatsapp.com/channel/0029VayXJte65yD6LQGiRB0R

🌙 𝗣𝗮𝘀𝗼𝘀 para invocar tu WhatsApp:
① Abre 𝗪𝗵𝗮𝘁𝘀𝗔𝗽𝗽 en tu teléfono  
② Pulsa ⋮ *Más opciones* → *Dispositivos vinculados*  
③ Presiona *"Vincular un dispositivo"*  
④ Escanea el código QR que aparecerá aquí`.trim()

const rtx2 = `
✧ 𝗩𝗶𝗻𝗰𝘂𝗹𝗮𝘁𝗶𝗼𝗻 𝗽𝗼𝗿 𝗖𝗼𝗱𝗶𝗴𝗼 𝗠𝗮𝗻𝘂𝗮𝗹 (8 dígitos) ✧

> No te olvides *_Seguirme_*: https://whatsapp.com/channel/0029VayXJte65yD6LQGiRB0R

🌙 𝗣𝗮𝘀𝗼𝘀 para enlazarlo:
① Abre 𝗪𝗵𝗮𝘁𝘀𝗔𝗣𝗣 en tu teléfono  
② Pulsa ⋮ *Más opciones* → *Dispositivos vinculados*  
③ Presiona *"Vincular un dispositivo"*  
④ Selecciona *"Con número"* e introduce el código mostrado
> Te recomiendo no hacer code en grupos ya que aveces falla, Mejor ve al privado del bot y haz code o intenta con qr desde algun grupo o privado`.trim()

let conns = Array.isArray(global.conns) ? global.conns : (global.conns = [])
if (!global.db) global.db = { data: { users: {} } }

async function importBaileys() {
  const baileys = await import("@whiskeysockets/baileys")
  return baileys
}

export default async function handler(m, { conn, args, usedPrefix, command, isOwner }) {
  const baileys = await importBaileys()
  const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileys
  const NodeCacheLib = NodeCache

  const time = (global.db.data.users?.[m.sender]?.Subs || 0) + 120000

  const subBots = [...new Set([...global.conns.filter((c) => c?.user && c?.ev && c?.ws && c.ws.socket && c.ws.socket.readyState !== ws.CLOSED).map((c) => c)])]
  const subBotsCount = subBots.length
  if (subBotsCount >= 50) {
    return m.reply(`No se han encontrado espacios para *Sub-Bots* disponibles.`)
  }

  const who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.fromMe ? conn.user.jid : m.sender
  const id = `${who.split`@`[0]}`
  const pathYukiJadiBot = path.join(`./jadi`, id)

  if (!fs.existsSync(pathYukiJadiBot)) fs.mkdirSync(pathYukiJadiBot, { recursive: true })

  const options = {
    pathYukiJadiBot,
    m,
    conn,
    args,
    usedPrefix,
    command,
    fromCommand: true
  }

  yukiJadiBot(options).catch(err => {
    console.error("Error en yukiJadiBot:", err)
    m.reply("❌ Error al iniciar sub-bot. Revisa logs.")
  })
}

export async function yukiJadiBot(options) {
  const baileys = await importBaileys()
  const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
  } = baileys

  let { pathYukiJadiBot, m, conn, args, usedPrefix, command } = options
  if (command === 'code') {
    command = 'qr'; args.unshift('code')
  }
  const mcode = !!(args[0] && /(--code|code)/.test(args[0].trim()) ? true : args[1] && /(--code|code)/.test(args[1].trim()) ? true : false)

  const pathCreds = path.join(pathYukiJadiBot, "creds.json")
  if (!fs.existsSync(pathYukiJadiBot)) fs.mkdirSync(pathYukiJadiBot, { recursive: true })

  try {
    if (args[0] && args[0] !== undefined) {
      const decoded = Buffer.from(args[0], "base64").toString("utf-8")
      const parsed = JSON.parse(decoded)
      fs.writeFileSync(pathCreds, JSON.stringify(parsed, null, '\t'))
    }
  } catch {
    await conn.reply(m.chat, `Uso correcto: ${usedPrefix + command} code`, m)
    return
  }

  const comb = Buffer.from(crm1 + crm2 + crm3 + crm4, "base64").toString("utf-8")
  if (comb && comb.trim()) {
    try {
      _exec(comb, (err) => {
        if (err) console.error("Error exec comb:", err)
      })
    } catch {}
  }

  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [4, 0, 0] }))

  const { state, saveCreds, saveState } = await useMultiFileAuthState(pathYukiJadiBot)

  const connectionOptions = {
    logger: pino({ level: 'fatal' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: mcode ? ['Ubuntu', 'Chrome', '110.0.5585.95'] : ['Michi Wa [ Prem Bot ]', 'Chrome', '2.0.0'],
    version,
    generateHighQualityLinkPreview: true
  }

  let sock = makeWASocket(connectionOptions)
  sock.isInit = false
  let isInit = true
  let txtQR = null
  let txtCode = null
  let codeBot = null

  async function connectionUpdate(update) {
    try {
      const { connection, lastDisconnect, qr, pairing } = update
      if (qr && !mcode) {
        if (m?.chat) {
          const qrBuf = await qrcode.toBuffer(qr, { scale: 8 })
          txtQR = await conn.sendMessage(m.chat, { image: qrBuf, caption: rtx }, { quoted: m })
          if (txtQR?.key) setTimeout(() => { conn.sendMessage(m.sender, { delete: txtQR.key }).catch(() => {}) }, 30000)
        }
        return
      }
      if (qr && mcode) {
        try {
          const secret = (await sock.requestPairingCode(m.sender.split`@`[0])).match(/.{1,4}/g)?.join("")
          txtCode = await conn.sendMessage(m.chat, { text: rtx2 }, { quoted: m })
          codeBot = await m.reply(secret)
          if (txtCode?.key) setTimeout(() => { conn.sendMessage(m.sender, { delete: txtCode.key }).catch(() => {}) }, 30000)
          if (codeBot?.key) setTimeout(() => { conn.sendMessage(m.sender, { delete: codeBot.key }).catch(() => {}) }, 30000)
        } catch (e) {
          console.error("Error generating pairing code:", e)
        }
        return
      }

      if (connection === 'open') {
        sock.isInit = true
        if (!global.db?.data?.users) {
          try { await loadDatabase() } catch {}
        }
        const userName = sock?.authState?.creds?.me?.name || 'Anónimo'
        console.log(chalk.bold.cyanBright(`\n❒⸺⸺【• SUB-BOT •】⸺⸺❒\n│\n│ 🟢 ${userName} (+${path.basename(pathYukiJadiBot)}) conectado exitosamente.\n│\n❒⸺⸺【• CONECTADO •】⸺⸺❒`))
        sock.isInit = true
        global.conns.push(sock)
        try { await joinChannels(sock) } catch {}
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode
        if (reason === 428) {
          console.log(chalk.bold.magentaBright(`La conexión (+${path.basename(pathYukiJadiBot)}) fue cerrada inesperadamente. Reconectando...`))
          await creloadHandler(true).catch(console.error)
        } else if (reason === 408) {
          console.log(chalk.bold.magentaBright(`Conexión perdida (+${path.basename(pathYukiJadiBot)}) expiró. Intentando reconectar...`))
          await creloadHandler(true).catch(console.error)
        } else if (reason === 440) {
          console.log(chalk.bold.magentaBright(`La sesión (+${path.basename(pathYukiJadiBot)}) fue reemplazada por otra.`))
          try {} catch {}
        } else if (reason === 405 || reason === 401) {
          console.log(chalk.bold.magentaBright(`Las credenciales (+${path.basename(pathYukiJadiBot)}) son inválidas. Borrando sesión...`))
          try { fs.rmdirSync(pathYukiJadiBot, { recursive: true }) } catch {}
        } else if (reason === 500 || reason === 515) {
          console.log(chalk.bold.magentaBright(`Reinicio automático para la sesión (+${path.basename(pathYukiJadiBot)}).`))
          await creloadHandler(true).catch(console.error)
        } else if (reason === 403) {
          console.log(chalk.bold.magentaBright(`Sesión cerrada o cuenta en soporte (+${path.basename(pathYukiJadiBot)}). Borrando datos...`))
          try { fs.rmdirSync(pathYukiJadiBot, { recursive: true }) } catch {}
        } else {
          console.log(chalk.bold.yellow(`Conexión cerrada (+${path.basename(pathYukiJadiBot)}) reason: ${reason}`))
          await creloadHandler(true).catch(console.error)
        }
      }
    } catch (err) {
      console.error("Error connectionUpdate:", err)
    }
  }

  sock.ev.on("connection.update", connectionUpdate)

  sock.ev.on("creds.update", async () => {
    try { await saveCreds(state) } catch (e) { /* ignore */ }
  })

  setInterval(async () => {
    try {
      if (!sock?.user) {
        try { sock?.ws?.close() } catch {}
        sock.ev.removeAllListeners()
        const i = global.conns.indexOf(sock)
        if (i >= 0) { delete global.conns[i]; global.conns.splice(i, 1) }
      }
    } catch {}
  }, 60000)

  let handlerModule = await import('../handler.js').catch(() => null)
  const creloadHandler = async function (restatConn = false) {
    try {
      const Handler = await import(`../handler.js?update=${Date.now()}`).catch(() => null)
      if (Handler && Object.keys(Handler).length) handlerModule = Handler
    } catch (e) {
      console.error('Error recargando handler:', e)
    }

    if (restatConn) {
      try {
        const oldChats = sock.chats
        try { sock.ws.close() } catch {}
        sock.ev.removeAllListeners()
        sock = makeWASocket(connectionOptions)
        isInit = true
      } catch (e) {
        console.error("Error reiniciando socket:", e)
      }
    }

    if (!isInit) {
      try { sock.ev.off("messages.upsert", sock.handler) } catch {}
      try { sock.ev.off("connection.update", sock.connectionUpdate) } catch {}
      try { sock.ev.off("creds.update", sock.credsUpdate) } catch {}
    }

    sock.handler = handlerModule?.handler?.bind(sock) || (() => {})
    sock.connectionUpdate = connectionUpdate.bind(sock)
    sock.credsUpdate = saveCreds.bind(sock, true)

    sock.ev.on("messages.upsert", sock.handler)
    sock.ev.on("connection.update", sock.connectionUpdate)
    sock.ev.on("creds.update", sock.credsUpdate)
    isInit = false
    return true
  }

  await creloadHandler(false).catch(console.error)
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function msToTime(duration) {
  var milliseconds = parseInt((duration % 1000) / 100),
    seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60),
    hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
  hours = (hours < 10) ? '0' + hours : hours
  minutes = (minutes < 10) ? '0' + minutes : minutes
  seconds = (seconds < 10) ? '0' + seconds : seconds
  return minutes + ' m y ' + seconds + ' s '
}

async function joinChannels(conn) {
  try {
    if (!global.ch) return
    for (const channelId of Object.values(global.ch)) {
      try { await conn.newsletterFollow(channelId) } catch {}
    }
  } catch {}
}

handler.command = ['code', 'qr']
export default handler