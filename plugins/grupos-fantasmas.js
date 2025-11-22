// sistema-fantasmas.js
// SISTEMA COMPLETO: messageHandler + comando fantasmas/fankick + auto-check

// ---------------------------
// LIMPIAR JIDs (SOLUCIÓN AL PROBLEMA DE FANTASMAS FALSOS)
// ---------------------------
function cleanJid(jid) {
    if (!jid) return jid;
    return jid
        .replace(/:.*@/, '@')                 // quitar deviceId (:1@)
        .replace(/[\s\n\r]+/g, '')            // quitar basura
        .replace(/@.+/, '@s.whatsapp.net');   // forzar dominio único
}

// ---------------------------
// ASEGURAR DB SEGURA
// ---------------------------
function ensureDB() {
    if (!global.db) global.db = { data: { users: {}, chats: {} } };
    if (!global.db.data) global.db.data = { users: {}, chats: {} };
    if (!global.db.data.users) global.db.data.users = {};
    if (!global.db.data.chats) global.db.data.chats = {};
}

// ---------------------------
// 1) REGISTRADOR DE ACTIVIDAD
// ---------------------------
export async function messageHandler(m, { conn }) {
    try {
        if (!m.isGroup) return;
        if (!m.sender) return;

        ensureDB();

        let sender = cleanJid(m.sender);
        let chat = m.chat;

        // Crear espacio del chat
        if (!global.db.data.chats[chat]) global.db.data.chats[chat] = {};

        // Ignorar si el bot mismo envía mensaje
        if (sender === cleanJid(conn.user.jid)) return;
        if (!m.message) return;

        // Tipos válidos
        const tiposValidos = Object.keys(m.message || {});
        const tipo = tiposValidos.length ? tiposValidos[0] : null;
        if (!tipo) return;

        // Registrar usuario en DB
        if (!global.db.data.users[sender]) global.db.data.users[sender] = { groups: {} };
        let user = global.db.data.users[sender];

        if (!user.groups) user.groups = {};
        if (!user.groups[chat]) user.groups[chat] = {};

        // Guardar actividad
        user.groups[chat].lastMessage = Date.now();

    } catch (err) {
        console.error('[messageHandler] error:', err);
    }
}

// ---------------------------
// 2) COMANDO .FANTASMAS / .FANKICK
// ---------------------------
let handler = async (m, { conn, participants, command }) => {
    try {
        ensureDB();

        const HORAS = 72;
        const INACTIVIDAD = HORAS * 60 * 60 * 1000;
        const ahora = Date.now();

        // Crear chat si no existe
        if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {};

        // Obtener participantes
        if (!participants || !Array.isArray(participants)) {
            let metadata = await conn.groupMetadata(m.chat).catch(() => null);
            if (!metadata) return conn.reply(m.chat, "No pude obtener participantes.", m);
            participants = metadata.participants;
        }

        let miembros = participants.map(v => cleanJid(v.id));
        let fantasmas = [];

        for (let raw of miembros) {
            let usuario = cleanJid(raw);

            if (usuario === cleanJid(conn.user.jid)) continue;

            let p = participants.find(u => cleanJid(u.id) === usuario);
            let isAdmin = !!(p?.admin || p?.isAdmin || p?.isSuperAdmin);
            if (isAdmin) continue;

            let dataUser = global.db.data.users[usuario];
            let lastMsg = dataUser?.groups?.[m.chat]?.lastMessage || 0;

            if (!lastMsg || ahora - lastMsg >= INACTIVIDAD) {
                fantasmas.push(usuario);
            }
        }

        fantasmas = [...new Set(fantasmas)]; // quitar duplicados

        if (fantasmas.length === 0) {
            return conn.reply(m.chat, "✨ No hay fantasmas en este grupo.", m);
        }

        if (command === "fankick") {
            try {
                await conn.groupParticipantsUpdate(m.chat, fantasmas, "remove");
                return conn.reply(
                    m.chat,
                    `🔥 Fantasmas eliminados:\n${fantasmas.map(v => '@' + v.split('@')[0]).join('\n')}`,
                    null,
                    { mentions: fantasmas }
                );
            } catch (e) {
                return conn.reply(m.chat, "No pude expulsar a algunos participantes.", m);
            }
        }

        // Mostrar lista
        let msg = `
👻 FANTASMAS DETECTADOS (72H)

Grupo: ${await conn.getName(m.chat)}

${fantasmas.map(v => '👻 @' + v.split('@')[0]).join('\n')}

Usa .fankick para expulsarlos.
`;

        conn.reply(m.chat, msg, null, { mentions: fantasmas });

    } catch (err) {
        console.error('[handler.fantasmas] error:', err);
    }
};

handler.help = ['fantasmas', 'fankick'];
handler.tags = ['group'];
handler.command = /^(fantasmas|sider|verfantasmas|fankick)$/i;
handler.admin = true;

export default handler;

// ---------------------------
// 3) AUTO-REVISIÓN (24h)
// ---------------------------
export function initAutoFantasma(conn) {
    if (!conn) throw new Error("initAutoFantasma necesita conn");
    if (global.autoFantasmaIniciado) return;

    global.autoFantasmaIniciado = true;

    const INTERVAL_MS = 24 * 60 * 60 * 1000;

    setInterval(async () => {
        try {
            ensureDB();

            let chats = Object.keys(global.db.data.chats);

            for (let id of chats) {
                let chat = global.db.data.chats[id];
                if (!chat?.autoFantasma) continue;

                let metadata = await conn.groupMetadata(id).catch(() => null);
                if (!metadata) continue;

                let participants = metadata.participants;

                const HORAS = 72;
                const INACTIVIDAD = HORAS * 60 * 60 * 1000;
                const ahora = Date.now();

                let fantasmas = [];

                for (let raw of participants.map(v => v.id)) {
                    let u = cleanJid(raw);

                    if (u === cleanJid(conn.user.jid)) continue;

                    let p = participants.find(x => cleanJid(x.id) === u);
                    let isAdmin = !!(p?.admin || p?.isAdmin || p?.isSuperAdmin);
                    if (isAdmin) continue;

                    let dataUser = global.db.data.users[u];
                    let lastMsg = dataUser?.groups?.[id]?.lastMessage || 0;

                    if (!lastMsg || ahora - lastMsg >= INACTIVIDAD) {
                        fantasmas.push(u);
                    }
                }

                if (fantasmas.length === 0) continue;
                fantasmas = [...new Set(fantasmas)];

                let msg = `
👻 AUTO-REVISIÓN DE FANTASMAS (72H)

Grupo: ${await conn.getName(id)}

${fantasmas.map(v => '👻 @' + v.split('@')[0]).join('\n')}
`;

                await conn.sendMessage(id, { text: msg, mentions: fantasmas });
            }
        } catch (err) {
            console.error('[autoFantasma] error:', err);
        }
    }, INTERVAL_MS);
}