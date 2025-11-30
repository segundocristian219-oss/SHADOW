let handler = async (m, { conn, args }) => {

    if (!args[0]) return m.reply(`⚠️ *Falta el número*\n\n📌 *Ejemplo:* .wa +52 722 758 4934`);

    const number = args.join(" ").replace(/\D/g, "");
    const jid = number + "@s.whatsapp.net";

    await m.reply(`🔍 *Analizando número con 7 métodos internos de WhatsApp...*`);

    // Contenedor de señales
    let report = {
        exists: false,
        pp: false,
        status: false,
        assert: false,
        presence: false,
        blockList: false,
        tmpError: false,
        permError: false,
        raw: ""
    };

    try {

        // 1) EXISTENCIA REAL
        try {
            const wa = await conn.onWhatsApp(jid);
            report.exists = !!(wa && wa[0] && wa[0].exists);
        } catch (e) {}

        // 2) FOTO DE PERFIL
        try {
            await conn.profilePictureUrl(jid, 'image');
            report.pp = true;
        } catch (e) {}

        // 3) STATUS
        try {
            await conn.fetchStatus(jid);
            report.status = true;
        } catch (e) {}

        // 4) assertJidExists (fuerte)
        try {
            await conn.assertJidExists(jid);
            report.assert = true;
        } catch (e) {}

        // 5) presenceSubscribe (silencioso)
        try {
            await conn.presenceSubscribe(jid);
            report.presence = true;
        } catch (e) {}

        // 6) blocklist
        try {
            await conn.fetchBlocklist();
            report.blockList = true;
        } catch (e) {}

    } catch (e) {
        report.raw = e?.message || "";
    }

    // 7) patrones de error
    const msg = (report.raw || "").toLowerCase();
    report.tmpError = /temporar|not-allowed|retry|too many/i.test(msg);
    report.permError = /404|unreg|does not|no record|unregistered/i.test(msg);

    // ======================================
    // SISTEMA DE SCORING ULTRA PRECISO
    // ======================================

    const WEIGHTS = {
        exists: 35,
        assert: 35,
        presence: 20,
        status: 12,
        pp: 8,
        blockList: 3,
        permError: -80,
        tmpError: -40
    };

    let rawScore = 0;

    rawScore += report.exists ? WEIGHTS.exists : 0;
    rawScore += report.assert ? WEIGHTS.assert : 0;
    rawScore += report.presence ? WEIGHTS.presence : 0;
    rawScore += report.status ? WEIGHTS.status : 0;
    rawScore += report.pp ? WEIGHTS.pp : 0;
    rawScore += report.blockList ? WEIGHTS.blockList : 0;
    rawScore += report.permError ? WEIGHTS.permError : 0;
    rawScore += report.tmpError ? WEIGHTS.tmpError : 0;

    // Normalización 0-100
    let score = Math.max(0, Math.min(100, Math.round(((rawScore + 100) / 200) * 100)));

    // Forzar si es ban permanente claro
    if (report.permError && !report.exists) score = Math.min(score, 15);

    // ======================================
    // DECISIÓN FINAL POR UMBRALES
    // ======================================
    let label = "INDETERMINADO";

    if (report.permError && !report.exists && !report.assert) {
        label = "🔴 BLOQUEO PERMANENTE (ALTA PRECISIÓN)";
    } else if (score >= 85) {
        label = "🟢 ACTIVO (NO BANEADO)";
    } else if (score >= 65) {
        label = "🟡 POSIBLE ACTIVO";
    } else if (score >= 40) {
        label = "⚪ INDETERMINADO (SEÑALES MIXTAS)";
    } else {
        label = "🔴 PROBABLE BLOQUEO";
    }

    // ======================================
    // RESPUESTA FINAL
    // ======================================

    const out = [
        `📱 Número: https://wa.me/${number}`,
        ``,
        `*${label}*`,
        ``,
        `📊 *Score:* ${score}%`,
        ``,
        `🧩 *Señales detectadas:*`,
        `• Existe: ${report.exists ? "✔" : "✘"}`,
        `• assertJidExists: ${report.assert ? "✔" : "✘"}`,
        `• Presence: ${report.presence ? "✔" : "✘"}`,
        `• Estado (Status): ${report.status ? "✔" : "✘"}`,
        `• Foto (PP): ${report.pp ? "✔" : "✘"}`,
        ``,
        `🧪 *Errores:*`,
        `• Temporal: ${report.tmpError ? "✔" : "✘"}`,
        `• Permanente: ${report.permError ? "✔" : "✘"}`,
        ``,
        `📄 *Detalles:*`,
        report.raw || "Sin errores detectados."
    ].join("\n");

    return m.reply(out);
};

handler.command = /^wa$/i;
export default handler;