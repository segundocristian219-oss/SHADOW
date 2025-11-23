// plugins/antiarabe.js — ESM + sistema de guardado en ./tmp/antiarabe.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- Utilidades dirname (ESM) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Ruta donde se guardará el estado ---
const TMP_DIR = path.join(process.cwd(), "tmp");
const DB_FILE = path.join(TMP_DIR, "antiarabe.json");

// Crear carpeta ./tmp si no existe
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// Crear archivo antiarabe.json si no existe
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "{}");

// --- Mini base: get/set/delete ---
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveData(obj) {
  fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2));
}

function setConfig(chatId, value) {
  const db = loadData();
  db[chatId] = value;
  saveData(db);
}

function deleteConfig(chatId) {
  const db = loadData();
  delete db[chatId];
  saveData(db);
}

function getConfig(chatId) {
  const db = loadData();
  return db[chatId];
}


const DIGITS = (s = "") => String(s).replace(/\D/g, "");

/** Si un participante viene como @lid y tiene .jid (real), usa ese real */
function lidParser(participants = []) {
  try {
    return participants.map(v => ({
      id: (typeof v?.id === "string" && v.id.endsWith("@lid") && v.jid) ? v.jid : v.id,
      admin: v?.admin ?? null,
      raw: v
    }));
  } catch {
    return participants || [];
  }
}

/** Verifica admin por NÚMERO */
async function isAdminByNumber(conn, chatId, number) {
  try {
    const meta = await conn.groupMetadata(chatId);
    const raw  = Array.isArray(meta?.participants) ? meta.participants : [];
    const norm = lidParser(raw);

    const adminNums = new Set();
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i], n = norm[i];
      const flag = (r?.admin === "admin" || r?.admin === "superadmin" ||
                    n?.admin === "admin" || n?.admin === "superadmin");
      if (flag) {
        [r?.id, r?.jid, n?.id].forEach(x => {
          const d = DIGITS(x || "");
          if (d) adminNums.add(d);
        });
      }
    }
    return adminNums.has(number);
  } catch {
    return false;
  }
}


const handler = async (msg, { conn }) => {
  const chatId    = msg.key.remoteJid;
  const isGroup   = chatId.endsWith("@g.us");
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNo  = DIGITS(senderJid);
  const isFromMe  = !!msg.key.fromMe;

  if (!isGroup) {
    await conn.sendMessage(chatId, { text: "❌ Este comando solo puede usarse en grupos." }, { quoted: msg });
    return;
  }

  await conn.sendMessage(chatId, { react: { text: "🛡️", key: msg.key } }).catch(() => {});

  const isAdmin = await isAdminByNumber(conn, chatId, senderNo);

  // Owners (opcional)
  let owners = [];
  try { owners = JSON.parse(fs.readFileSync(path.join(__dirname, "../owner.json"), "utf-8")); }
  catch { owners = global.owner || []; }

  const isOwner = Array.isArray(owners) && owners.some(([id]) => id === senderNo);

  if (!isAdmin && !isOwner && !isFromMe) {
    await conn.sendMessage(chatId, {
      text: "🚫 Solo los administradores pueden activar o desactivar el antiárabe."
    }, { quoted: msg });
    return;
  }

  const body   = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
  const estado = (body.trim().split(/\s+/)[1] || "").toLowerCase();

  if (!["on", "off"].includes(estado)) {
    await conn.sendMessage(chatId, { text: "✳️ Usa:\n\n.antiarabe on / off" }, { quoted: msg });
    return;
  }

  if (estado === "on") {
    setConfig(chatId, 1);
  } else {
    deleteConfig(chatId);
  }

  await conn.sendMessage(chatId, {
    text: `🛡️ AntiÁrabe ha sido *${estado === "on" ? "activado" : "desactivado"}* correctamente en este grupo.`
  }, { quoted: msg });

  await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } }).catch(() => {});
  console.log(`AntiArabe ${estado.toUpperCase()} guardado en tmp/antiarabe.json para ${chatId}`);
};

handler.command = ["antiarabe"];
export default handler;