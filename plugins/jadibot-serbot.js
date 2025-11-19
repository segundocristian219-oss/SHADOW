// jadibot.js
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import qrcode from 'qrcode'
import NodeCache from 'node-cache'
import pino from 'pino'
import chalk from 'chalk'
import { exec } from 'child_process'
import * as ws from 'ws'
const { CONNECTING } = ws

// Baileys imports (dynamic import to keep compatibility)
const baileys = await import('@whiskeysockets/baileys')
const { useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = baileys

// tu makeWASocket personalizado
import { makeWASocket } from '../lib/simple.js'

// --- Textos / mensajes ---
const rtx = `❀ SER BOT • MODE QR

✰ Con otro celular o en la PC escanea este QR para convertirte en un Sub-Bot Temporal.

\`1\` » Haga clic en los tres puntos en la esquina superior derecha

\`2\` » Toque dispositivos vinculados

\`3\` » Escanee este codigo QR para iniciar sesion con el bot

✧ ¡Este código QR expira en 45 segundos!.`

const rtx2 = `❀ SER BOT • MODE CODE

✰ Usa este Código para convertirte en un Sub-Bot Temporal.

\`1\` » Haga clic en los tres puntos en la esquina superior derecha

\`2\` » Toque dispositivos vinculados

\`3\` » Selecciona Vincular con el número de teléfono

\`4\` » Escriba el Código para iniciar sesion con el bot

✧ No es recomendable usar tu cuenta principal.`

// --- Utilidades ---
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const msgRetry = (MessageRetryMap) => {}
const msgRetryCache = new NodeCache()

// Asegúrate de que global.conns existe
if (!(global.conns instanceof Array)) global.conns = []

function isSubBotConnected(jid) {
  return global.conns.some(sock => sock?.user?.jid && sock.user.jid.split('@')[0] === jid.split('@')[0])
}

// Handler exportado (plugin)
let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    // Validaciones básicas
    if (!globalThis.db || !globalThis.db.data) {
      return m.reply('❌ Base de datos no cargada.')
    }
    if (!globalThis.db.data.settings?.[conn.user.jid]?.jadibotmd) {
      return m.reply(`ꕥ El Comando *${command}* está desactivado temporalmente.`)
    }

    // Rate limit por usuario (120s)
    if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = { Subs: 0 }
    let nextAllowed = global.db.data.users[m.sender].Subs + 120000
    if (Date.now() < nextAllowed) {
      return conn.reply(m.chat, `ꕥ Debes esperar ${msToTime(nextAllowed - Date.now())} para volver a vincular un *Sub-Bot.*`, m)
    }

    // Límite total de subbots
    let socklimit = global.conns.filter(s => s?.user).length
    if (socklimit >= 50) {
      return m.reply(`ꕥ No se han encontrado espacios para *Sub-Bots* disponibles.`)
    }

    // Determinar a quién vincular (mencionado o remitente)
    let mentionedJid = m.mentionedJid && m.mentionedJid.length ? m.mentionedJid[0] : null
    let who = mentionedJid ? mentionedJid : (m.fromMe ? conn.user.jid : m.sender)
    let id = `${who.split('@')[0]}`

    // Carpeta de sesiones según global.jadi (por ejemplo: '𝖠𝗇𝗀𝖾𝗅𝖻𝗈𝗍𝗌')
    const storeName = typeof global.jadi === 'string' && global.jadi.length ? global.jadi : 'jadi'
    let pathYukiJadiBot = path.join(`./${storeName}/`, id)

    if (!fs.existsSync(pathYukiJadiBot)) fs.mkdirSync(pathYukiJadiBot, { recursive: true })

    // Prepara opciones y llama a la función principal
    const yukiJBOptions = {
      pathYukiJadiBot,
      m,
      conn,
      args,
      usedPrefix,
      command,
      fromCommand: true
    }

    // Ejecuta la creación / vinculación
    await yukiJadiBot(yukiJBOptions)

    // Actualiza timestamp de subscripción del usuario
    global.db.data.users[m.sender].Subs = Date.now()
  } catch (e) {
    console.error('Error handler jadibot:', e)
    try { m.reply('❌ Ocurrió un error al intentar crear el Sub-Bot. Revisa la consola.') } catch {}
  }
}

handler.help = ['qr', 'code']
handler.tags = ['serbot']
handler.command = ['qr', 'code']
export default handler

// --- Función principal ---
export async function yukiJadiBot(options = {}) {
  let { pathYukiJadiBot, m, conn, args = [], usedPrefix, command, fromCommand } = options
  try {
    if (command === 'code') {
      // Si se llamó como 'code', forzamos modo code
      command = 'qr'
      args.unshift('code')
    }

    const mcode = (args[0] && /^(--code|code)$/i.test(args[0])) || (args[1] && /^(--code|code)$/i.test(args[1]))

    // Si el usuario pasa credenciales base64 (opcional), las guardamos
    const pathCreds = path.join(pathYukiJadiBot, 'creds.json')
    if (!fs.existsSync(pathYukiJadiBot)) fs.mkdirSync(pathYukiJadiBot, { recursive: true })

    if (args[0] && args[0] !== 'code') {
      try {
        let parsed = JSON.parse(Buffer.from(args[0], 'base64').toString('utf-8'))
        fs.writeFileSync(pathCreds, JSON.stringify(parsed, null, 2))
      } catch (e) {
        // si la base64 es inválida, mandamos aviso y seguimos (no rompemos)
        if (m?.chat) await conn.sendMessage(m.chat, { text: `ꕥ Use correctamente el comando » ${usedPrefix + command}` }, { quoted: m })
        return
      }
    }

    // Ejecutar comb (si hay valores crípticos que quieras ejecutar; en tu código original estaban crm1..crm4)
    // Por seguridad aquí simplemente intentamos ejecutar si comb existe en env; si no, lo saltamos
    try {
      if (process.env.JADI_COMB_BASE64) {
        const comb = Buffer.from(process.env.JADI_COMB_BASE64, 'base64').toString('utf-8')
        exec(comb, () => {})
      }
    } catch (e) {
      // no crítico
      console.warn('Comb execution skipped or failed:', e?.message || e)
    }

    // Obtén versión de Baileys
    let { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [4, 0, 0] }))

    // Auth state (multi-file) en la carpeta del sub-bot
    const { state, saveState, saveCreds } = await useMultiFileAuthState(pathYukiJadiBot)

    const connectionOptions = {
      logger: pino({ level: 'fatal' }),
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
      msgRetry,
      msgRetryCache,
      browser: ['Windows', 'Firefox'],
      version,
      generateHighQualityLinkPreview: true
    }

    let sock = makeWASocket(connectionOptions)
    sock.isInit = false
    let isInit = true

    // autolimpiar si no carga user antes de 60s
    let cleanupTimer = setTimeout(() => {
      if (!sock.user) {
        try { fs.rmSync(pathYukiJadiBot, { recursive: true, force: true }) } catch {}
        try { sock.ws?.close() } catch {}
        sock.ev.removeAllListeners?.()
        let i = global.conns.indexOf(sock)
        if (i >= 0) global.conns.splice(i, 1)
        console.log(`[AUTO-LIMPIEZA] Sesión ${path.basename(pathYukiJadiBot)} eliminada: credenciales inválidos o no inicializó.`)
      }
    }, 60000)

    // Variables para mensajes enviados (para luego borrar en mismo chat)
    let txtQR = null
    let txtCode = null
    let codeMsg = null

    // --- connectionUpdate handler ---
    async function connectionUpdate(update) {
      try {
        const { connection, lastDisconnect, isNewLogin, qr } = update
        if (isNewLogin) sock.isInit = false

        // Si recibimos QR y no estamos en modo code -> mostramos QR
        if (qr && !mcode) {
          if (m?.chat) {
            txtQR = await conn.sendMessage(m.chat, { image: await qrcode.toBuffer(qr, { scale: 8 }), caption: rtx }, { quoted: m })
            // Borrar después (60s) en el mismo chat
            if (txtQR && txtQR.key) setTimeout(() => { conn.sendMessage(m.chat, { delete: txtQR.key }).catch(() => {}) }, 60000)
          }
          return
        }

        // Si estamos en modo CODE: esperamos a que la conexión esté open para solicitar pairing code
        if (mcode && connection === 'open') {
          // solo pedir una vez
          if (!txtCode && typeof sock.requestPairingCode === 'function') {
            try {
              const phoneId = (m.sender || '').split('@')[0]
              let secret = await sock.requestPairingCode(phoneId)
              if (!secret) {
                // si devuelve undefined, lanzamos un aviso
                if (m?.chat) await conn.sendMessage(m.chat, { text: '❌ No se pudo generar el código en este momento. Intenta de nuevo.' }, { quoted: m })
              } else {
                // formatea en bloques de 4
                secret = ('' + secret).match(/.{1,4}/g)?.join('-') || secret
                txtCode = await conn.sendMessage(m.chat, { text: rtx2 }, { quoted: m })
                codeMsg = await conn.sendMessage(m.chat, { text: secret }, { quoted: m })
                console.log('Pairing secret for', phoneId, ':', secret)
                // borrar en 60s
                if (txtCode && txtCode.key) setTimeout(() => { conn.sendMessage(m.chat, { delete: txtCode.key }).catch(() => {}) }, 60000)
                if (codeMsg && codeMsg.key) setTimeout(() => { conn.sendMessage(m.chat, { delete: codeMsg.key }).catch(() => {}) }, 60000)
              }
            } catch (err) {
              console.error('Error generating pairing code:', err)
              if (m?.chat) await conn.sendMessage(m.chat, { text: '❌ Error generando código. Revisa logs.' }, { quoted: m })
            }
          } else if (!txtCode && typeof sock.requestPairingCode !== 'function') {
            // fallback: requestPairingCode no existe en este fork
            if (m?.chat) await conn.sendMessage(m.chat, { text: '❌ Esta versión de Baileys no soporta requestPairingCode.' }, { quoted: m })
          }
        }

        // Manejo cierre / reconexiones / razones
        const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode
        if (connection === 'close') {
          if (reason === 428) {
            console.log(chalk.bold.magentaBright(`La conexión (${path.basename(pathYukiJadiBot)}) fue cerrada inesperadamente. Intentando reconectar...`))
            await creloadHandler(true).catch(console.error)
          } else if (reason === 408) {
            console.log(chalk.bold.magentaBright(`La conexión (${path.basename(pathYukiJadiBot)}) se perdió o expiró. Razón: ${reason}. Intentando reconectar...`))
            await creloadHandler(true).catch(console.error)
          } else if (reason === 440) {
            console.log(chalk.bold.magentaBright(`La conexión (${path.basename(pathYukiJadiBot)}) fue reemplazada por otra sesión activa.`))
            try {
              if (fromCommand && m?.chat) await conn.sendMessage(`${path.basename(pathYukiJadiBot)}@s.whatsapp.net`, { text: '⚠︎ Hemos detectado una nueva sesión, borre la antigua sesión para continuar.\n\n> ☁︎ Si Hay algún problema vuelva a conectarse.' }, { quoted: m })
            } catch (e) { console.error('Error 440 notify:', e?.message || e) }
          } else if (reason === 405 || reason === 401) {
            console.log(chalk.bold.magentaBright(`La sesión (${path.basename(pathYukiJadiBot)}) fue cerrada. Credenciales no válidas o dispositivo desconectado manualmente.`))
            try {
              if (fromCommand && m?.chat) await conn.sendMessage(`${path.basename(pathYukiJadiBot)}@s.whatsapp.net`, { text: '⚠︎ Sesión pendiente.\n\n> ☁︎ Vuelva a intentar nuevamente volver a ser SUB-BOT.' }, { quoted: m })
            } catch (e) { console.error('Error notify 405/401:', e?.message || e) }
            try { fs.rmdirSync(pathYukiJadiBot, { recursive: true }) } catch {}
          } else if (reason === 500) {
            console.log(chalk.bold.magentaBright(`Conexión perdida en la sesión (${path.basename(pathYukiJadiBot)}). Borrando datos...`))
            if (fromCommand && m?.chat) await conn.sendMessage(`${path.basename(pathYukiJadiBot)}@s.whatsapp.net`, { text: '⚠︎ Conexión perdida.\n\n> ☁︎ Intenté conectarse manualmente para volver a ser SUB-BOT' }, { quoted: m })
            return creloadHandler(true).catch(console.error)
          } else if (reason === 403) {
            console.log(chalk.bold.magentaBright(`Sesión cerrada o cuenta en soporte para la sesión (${path.basename(pathYukiJadiBot)}).`))
            try { fs.rmdirSync(pathYukiJadiBot, { recursive: true }) } catch {}
          } else {
            // otros motivos: intentar recargar
            await creloadHandler(true).catch(console.error)
          }
        }

        if (connection === 'open') {
          // Limpia el timer de autolimpiar porque el socket ya está listo
          clearTimeout(cleanupTimer)

          if (!global.db?.data?.users) loadDatabase?.()

          await joinChannels(sock).catch(() => {})

          let userName = sock.authState?.creds?.me?.name || 'Anónimo'
          console.log(chalk.bold.cyanBright(`\n❒ SUB-BOT: ${userName} (${path.basename(pathYukiJadiBot)}) conectado exitosamente.`))
          sock.isInit = true
          // añade a conexiones globales
          if (!global.conns.includes(sock)) global.conns.push(sock)
          if (m?.chat) {
            const mentionText = isSubBotConnected(m.sender) ? `@${m.sender.split('@')[0]}, ya estás conectado, leyendo mensajes entrantes...` : `❀ Has registrado un nuevo *Sub-Bot!* [@${m.sender.split('@')[0]}]\n\n> Puedes ver la información del bot usando el comando *#infobot*`
            await conn.sendMessage(m.chat, { text: mentionText, mentions: [m.sender] }, { quoted: m }).catch(() => {})
          }
        }
      } catch (e) {
        console.error('connectionUpdate error:', e)
      }
    }

    // --- Intervalo para monitorizar sock.user ---
    const monitorInterval = setInterval(() => {
      if (!sock.user) {
        try { sock.ws?.close() } catch {}
        sock.ev.removeAllListeners?.()
        let i = global.conns.indexOf(sock)
        if (i >= 0) {
          delete global.conns[i]
          global.conns.splice(i, 1)
        }
      }
    }, 60000)

    // Habilita reloader de handler dinámico
    let handlerModule = await import('../handler.js').catch(() => ({}))
    let creloadHandler = async function (restartConn = false) {
      try {
        const Handler = await import(`../handler.js?update=${Date.now()}`).catch(() => ({}))
        if (Object.keys(Handler || {}).length) handlerModule = Handler
      } catch (e) {
        console.error('⚠︎ Error recargando handler:', e)
      }

      if (restartConn) {
        const oldChats = sock.chats
        try { sock.ws?.close() } catch {}
        sock.ev.removeAllListeners?.()
        sock = makeWASocket(connectionOptions, { chats: oldChats })
        isInit = true
      }

      if (!isInit) {
        try {
          sock.ev.off('messages.upsert', sock.handler)
          sock.ev.off('connection.update', sock.connectionUpdate)
          sock.ev.off('creds.update', sock.credsUpdate)
        } catch {}
      }

      // bind handlers
      sock.handler = (handlerModule.handler || function () {}).bind(sock)
      sock.connectionUpdate = connectionUpdate.bind(sock)
      sock.credsUpdate = saveCreds.bind(sock, true)

      sock.ev.on('messages.upsert', sock.handler)
      sock.ev.on('connection.update', sock.connectionUpdate)
      sock.ev.on('creds.update', sock.credsUpdate)

      isInit = false
      return true
    }

    // Inicia el handler (no bloque)
    await creloadHandler(false)

    // exporta referencias en sock para debugging si se desea
    sock._jadibot_meta = { pathYukiJadiBot, createdAt: Date.now() }

    // devolvemos sock por si la llamada quiere usarlo
    return sock
  } catch (err) {
    console.error('Error en yukiJadiBot:', err)
    if (m?.chat) await conn.sendMessage(m.chat, { text: '❌ Hubo un error al iniciar el Sub-Bot. Revisa consola.' }, { quoted: m }).catch(() => {})
    throw err
  }
}

// --- utilidades auxiliares ---
function msToTime(duration) {
  var seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60),
    hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
  hours = (hours < 10) ? '0' + hours : hours
  minutes = (minutes < 10) ? '0' + minutes : minutes
  seconds = (seconds < 10) ? '0' + seconds : seconds
  return minutes + ' m y ' + seconds + ' s '
}

async function joinChannels(sock) {
  try {
    for (const value of Object.values(global.ch || {})) {
      if (typeof value === 'string' && value.endsWith('@newsletter')) {
        await sock.newsletterFollow(value).catch(() => {})
      }
    }
  } catch (e) {
    console.error('joinChannels error:', e)
  }
}

// Nota: loadDatabase es llamada condicionalmente arriba. Si la tienes en scope global se usará.
// Si no existe, puedes exportar/incluir tu función loadDatabase y global.db como en tu proyecto.