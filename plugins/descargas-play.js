import axios from "axios" import yts from "yt-search" import fs from "fs" import path from "path" import ffmpeg from "fluent-ffmpeg" import { promisify } from "util" import { pipeline } from "stream" import crypto from "crypto"

const streamPipe = promisify(pipeline) const TMP_DIR = path.join(process.cwd(), "tmp") if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

const SKY_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click" const SKY_KEY = process.env.API_KEY || "Russellxz" const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 3 const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 99 const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 7 * 24 * 60 * 60 * 1000 const DOWNLOAD_TIMEOUT = Number(process.env.DOWNLOAD_TIMEOUT) || 60000 const MAX_TMP_MB = Number(process.env.MAX_TMP_MB) || 1024 // total tmp dir cap const TMP_PRUNE_TARGET_MB = Number(process.env.TMP_PRUNE_TARGET_MB) || Math.floor(MAX_TMP_MB * 0.7)

const pending = {} const cache = {} let activeDownloads = 0 const downloadQueue = [] const downloadTasks = {}

// Utilities function safeUnlink(file) { try { if (file && fs.existsSync(file)) fs.unlinkSync(file) } catch(e) {} } function safeStat(file) { try { return fs.statSync(file) } catch { return null } } function fileSizeBytes(filePath) { const st = safeStat(filePath); return st ? st.size : 0 } function fileSizeMB(filePath) { return fileSizeBytes(filePath) / (1024 * 1024) } function readHeader(file, length = 16) { try { const fd = fs.openSync(file, "r"); const buf = Buffer.alloc(length); fs.readSync(fd, buf, 0, length, 0); fs.closeSync(fd); return buf } catch { return null } }

function ensureDirSizeUnderLimit() { try { const files = fs.readdirSync(TMP_DIR).map(f => ({ f, p: path.join(TMP_DIR, f), c: safeStat(path.join(TMP_DIR,f)) })).filter(x=>x.c) let total = files.reduce((s,x)=>s + x.c.size, 0) const limit = MAX_TMP_MB * 1024 * 1024 if (total <= limit) return // sort oldest first files.sort((a,b)=>a.c.mtimeMs - b.c.mtimeMs) for (const file of files) { safeUnlink(file.p) total -= file.c.size if (total <= TMP_PRUNE_TARGET_MB * 1024 * 1024) break } } catch (e) { } }

function validCache(file, expectedSize = null) { if (!file || !fs.existsSync(file)) return false const stats = fs.statSync(file) const size = stats.size if (size < 50 * 1024) return false if (expectedSize && expectedSize > 0 && size < expectedSize * 0.92) return false const header = readHeader(file, 16) if (!header) return false const hex = header.toString("hex") if (file.endsWith(".mp3") && !hex.match(/^(494433|fff|fffb|fff3)/)) return false if ((file.endsWith(".mp4") || file.endsWith(".m4a")) && !hex.includes("66747970")) return false return true }

async function wait(ms) { return new Promise(res => setTimeout(res, ms)) }

async function queueDownload(task) { if (activeDownloads >= MAX_CONCURRENT) await new Promise(resolve => downloadQueue.push(resolve)) activeDownloads++ try { return await task() } finally { activeDownloads--; if (downloadQueue.length) downloadQueue.shift()() } }

async function getSkyApiUrl(videoUrl, format, timeout = 20000, retries = 2) { for (let attempt = 0; attempt <= retries; attempt++) { try { const { data } = await axios.get(${SKY_BASE}/api/download/yt.php, { params: { url: videoUrl, format }, headers: { Authorization: Bearer ${SKY_KEY} }, timeout }) const result = data?.data || data const url = result?.audio || result?.video || result?.url || result?.download if (typeof url === "string" && url.startsWith("http")) return url } catch (e) {} if (attempt < retries) await wait(500 * (attempt + 1)) } return null }

async function probeRemote(url, timeout = 10000) { try { const res = await axios.head(url, { timeout, maxRedirects: 5 }) return { ok: true, size: res.headers["content-length"] ? Number(res.headers["content-length"]) : null, acceptRanges: !!res.headers["accept-ranges"], headers: res.headers } } catch { return { ok: false } } }

async function downloadWithResume(url, filePath, signal, start = 0, timeout = DOWNLOAD_TIMEOUT) { // We add small retry logic inside by catching stream errors const headers = start > 0 ? { Range: bytes=${start}- } : {} const res = await axios.get(url, { responseType: "stream", timeout, headers: { "User-Agent": "WhatsAppBot", ...headers }, signal, maxRedirects: 5 }) const writeStream = fs.createWriteStream(filePath, { flags: start > 0 ? "a" : "w" }) await streamPipe(res.data, writeStream) return filePath }

async function convertToMp3(inputFile) { const outFile = inputFile.replace(path.extname(inputFile), ".mp3") await new Promise((resolve, reject) => ffmpeg(inputFile).audioCodec("libmp3lame").audioBitrate("128k").format("mp3").on("end", resolve).on("error", reject).save(outFile) ) safeUnlink(inputFile) return outFile }

function ensureTask(videoUrl) { if (!downloadTasks[videoUrl]) downloadTasks[videoUrl] = {}; return downloadTasks[videoUrl] }

async function manageDownload(videoUrl, key, mediaUrl) { const tasks = ensureTask(videoUrl) if (tasks[key]?.status === "done") return tasks[key].file if (tasks[key]?.status === "downloading") return tasks[key].promise

const ext = key.startsWith("audio") ? "mp3" : "mp4" ensureDirSizeUnderLimit() const file = path.join(TMP_DIR, ${crypto.randomUUID()}_${key}.${ext}) const controller = new AbortController() const info = { file, status: "downloading", controller, promise: null }

info.promise = (async () => { try { let start = fs.existsSync(file) ? fs.statSync(file).size : 0 const probe = await probeRemote(mediaUrl) const expectedSize = probe.ok && probe.size ? probe.size : null

// If remote size > limit -> throw early
  if (expectedSize && (expectedSize / (1024*1024)) > MAX_FILE_MB) throw new Error("Archivo remoto demasiado grande")

  await queueDownload(() => downloadWithResume(mediaUrl, file, controller.signal, start))

  // convert when requested
  if (key.startsWith("audio") && path.extname(file) !== ".mp3") {
    try { info.file = await convertToMp3(file) } catch (e) { throw new Error("Error al convertir a MP3: " + (e?.message||e)) }
  } else {
    info.file = file
  }

  if (!validCache(info.file, expectedSize)) { safeUnlink(info.file); throw new Error("Archivo inválido después de la descarga") }
  if (fileSizeMB(info.file) > MAX_FILE_MB) { safeUnlink(info.file); throw new Error("Archivo demasiado grande") }
  info.status = "done"
  return info.file
} catch (err) {
  if (err?.name === "CanceledError" || err?.message === "canceled") { info.status = "paused"; return info.file }
  info.status = "error"; safeUnlink(info.file); throw err
}

})()

tasks[key] = info return info.promise }

async function sendFileToChat(conn, chatId, filePath, title, asDocument, type, quoted) { if (!validCache(filePath)) { try { await conn.sendMessage(chatId, { text: "❌ Archivo inválido." }, { quoted }) } catch {} ; return } const stream = fs.createReadStream(filePath) const fileName = ${title}.${type === "audio" ? "mp3" : "mp4"} await conn.sendMessage(chatId, { [asDocument ? "document" : type]: stream, mimetype: type === "audio" ? "audio/mpeg" : "video/mp4", fileName }, { quoted }) cacheCleanup() }

function cacheCleanup() { const now = Date.now() for (const id in cache) { if (now - cache[id].timestamp > CACHE_TTL_MS) { for (const f of Object.values(cache[id].files || {})) safeUnlink(f) delete cache[id] } } }

// Periodic housekeeping setInterval(() => cacheCleanup(), 60 * 60 * 1000) // every hour setInterval(() => ensureDirSizeUnderLimit(), 30 * 60 * 1000) // every 30 min

async function handleDownload(conn, job, choice) { const mapping = { "👍": "audio", "❤️": "video", "📄": "audioDoc", "📁": "videoDoc" } const key = mapping[choice]; if (!key) return const isDoc = key.endsWith("Doc"); const type = key.startsWith("audio") ? "audio" : "video"; const id = job.videoUrl

const cached = cache[id]?.files?.[key] if (cached && validCache(cached)) { await conn.sendMessage(job.chatId, { text: ⚡ Enviando ${type} (${fileSizeMB(cached).toFixed(1)} MB) }, { quoted: job.commandMsg }) cache[id].timestamp = Date.now() return sendFileToChat(conn, job.chatId, cached, job.title, isDoc, type, job.commandMsg) }

const mediaUrl = await getSkyApiUrl(id, type, 40000, 2) if (!mediaUrl) return conn.sendMessage(job.chatId, { text: ❌ No se obtuvo enlace de ${type} }, { quoted: job.commandMsg })

const probe = await probeRemote(mediaUrl) if (!probe.ok) return conn.sendMessage(job.chatId, { text: ❌ No se puede acceder al recurso remoto. }, { quoted: job.commandMsg }) if (probe.size && probe.size / (1024 * 1024) > MAX_FILE_MB) return conn.sendMessage(job.chatId, { text: ❌ Archivo muy grande (${(probe.size/(1024*1024)).toFixed(1)} MB). }, { quoted: job.commandMsg })

try { await conn.sendMessage(job.chatId, { text: ⏳ Iniciando descarga de ${type}... }, { quoted: job.commandMsg }) const f = await manageDownload(id, key, mediaUrl) if (f && validCache(f)) { cache[id] = cache[id] || { timestamp: Date.now(), files: {} } cache[id].files[key] = f cache[id].timestamp = Date.now() await conn.sendMessage(job.chatId, { text: ⚡ Enviando ${type} (${fileSizeMB(f).toFixed(1)} MB) }, { quoted: job.commandMsg }) return sendFileToChat(conn, job.chatId, f, job.title, isDoc, type, job.commandMsg) } else return conn.sendMessage(job.chatId, { text: ❌ Descarga completada pero archivo inválido. }, { quoted: job.commandMsg }) } catch (err) { return conn.sendMessage(job.chatId, { text: ❌ Error: ${err?.message || err} }, { quoted: job.commandMsg }) } }

// MAIN HANDLER const handler = async (msg, { conn, text, command }) => { const pref = global.prefixes?.[0] || "." if (command === "clean") { let deleted = 0, freed = 0 for (const id in cache) { for (const f of Object.values(cache[id].files || {})) { const s = fileSizeMB(f); safeUnlink(f); deleted++; freed += s * 1024 * 1024 } delete cache[id] } for (const f of fs.readdirSync(TMP_DIR)) { const full = path.join(TMP_DIR,f); const s = fileSizeMB(full); safeUnlink(full); deleted++; freed += s10241024 } ensureDirSizeUnderLimit() return conn.sendMessage(msg.chat, { text: 🧹 Limpieza PRO\nEliminados: ${deleted}\nEspacio liberado: ${(freed/(1024*1024)).toFixed(2)} MB }, { quoted: msg }) }

if (!text?.trim()) return conn.sendMessage(msg.key.remoteJid, { text: ✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles }, { quoted: msg })

try { await conn.sendMessage(msg.key.remoteJid, { react: { text: "⏳", key: msg.key } }) } catch {} let res; try { res = await yts(text) } catch { return conn.sendMessage(msg.key.remoteJid, { text: "❌ Error al buscar video." }, { quoted: msg }) } const video = res.videos?.[0]; if (!video) return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg }) const { url: videoUrl, title, timestamp: duration, views, author, thumbnail } = video

const caption = \n𝚂𝚄𝙿𝙴𝚁 𝙿𝙻𝙰𝚈\n🎵 𝚃𝚒́𝚝𝚞𝚕𝚘: ${title}\n🕑 𝙳𝚞𝚛𝚊𝚌𝚒́𝚘𝚗: ${duration}\n👁️‍🗨️ 𝚅𝚒𝚜𝚝𝚊𝚜: ${(views||0).toLocaleString()}\n🎤 𝙰𝚛𝚝𝚒𝚜𝚝𝚊: ${author?.name || author || "Desconocido"}\n🌐 𝙻𝚒𝚗𝚔: ${videoUrl}\n\n📥 Reacciona para descargar:\n☛ 👍 Audio MP3\n☛ ❤️ Video MP4\n☛ 📄 Audio Doc\n☛ 📁 Video Doc\n.trim()

const preview = await conn.sendMessage(msg.key.remoteJid, { image: { url: thumbnail }, caption }, { quoted: msg }) pending[preview.key.id] = { chatId: msg.key.remoteJid, videoUrl, title, commandMsg: msg, sender: msg.key.participant || msg.participant, downloading: false } setTimeout(() => delete pending[preview.key.id], 10601000) try { await conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } }) } catch {}

// Register event listener once per connection instance (prevents duplicates on reloads) if (!conn._listeners) conn._listeners = {} if (!conn._listeners.play) { conn._listeners.play = true const onMessages = async ev => { for (const m of ev.messages || []) { const react = m.message?.reactionMessage if (!react) continue const { key: reactKey, text: emoji, sender } = react const job = pending[reactKey?.id] if (!job || !["👍","❤️","📄","📁"].includes(emoji)) continue // Ensure only original requester reacts if ((sender || m.key.participant) !== job.sender) { await conn.sendMessage(job.chatId, { text: "❌ No autorizado." }, { quoted: job.commandMsg }); continue } if (job.downloading) continue job.downloading = true try { await handleDownload(conn, job, emoji) } finally { job.downloading = false } } } conn.ev.on("messages.upsert", onMessages)

// clean up listeners on process exit to avoid memory leaks during HMR / reloads
const cleanup = () => { try { conn.ev.off && conn.ev.off("messages.upsert", onMessages) } catch(e){} }
process.on("exit", cleanup)
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

} }

handler.command = ["play","clean"] export default handler