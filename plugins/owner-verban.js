/**
 * Handler ultra-preciso de verificación de número WhatsApp para Baileys v6.7.18
 *
 * Estrategia:
 *  - Múltiples probes en paralelo + retries/timeouts
 *  - Analiza estructura de waInfo, foto de perfil, presencia y errores HTTP
 *  - Heurística de scoring que combina señales fuertes (404, "unregistered") y débiles (no PP)
 *
 * Nota: Baileys puede exponer funciones adicionales en tu build; el handler intenta usarlas
 * pero no depende de ellas (caen en try/catch si no existen).
 */

const DEFAULT_TIMEOUT = 5000; // ms por probe
const RETRIES = 2;

const timeoutPromise = (p, ms, tag = "timeout") =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag}`)), ms)),
  ]);

const safeCall = async (fn) => {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e };
  }
};

const probeOnWhatsApp = async (conn, jid) => {
  return await safeCall(() => conn.onWhatsApp(jid));
};

const probeProfilePic = async (conn, jid) => {
  return await safeCall(() => conn.profilePictureUrl(jid, "image"));
};

const probePresence = async (conn, jid) => {
  // sendPresenceUpdate puede lanzar si el jid está bloqueado/no existe
  return await safeCall(async () => {
    // intentar subscribir a presencia si está disponible (no rompe si no existe)
    if (conn.presenceSubscribe) {
      try { conn.presenceSubscribe(jid); } catch (e) {}
    }
    return await conn.sendPresenceUpdate("available", jid);
  });
};

const probeFetchStatus = async (conn, jid) => {
  // Algunas builds tienen fetchStatus / fetchStatusMessage / statusGet - intentamos varias
  return await safeCall(async () => {
    if (typeof conn.fetchStatus === "function") return await conn.fetchStatus(jid);
    if (typeof conn.getStatus === "function") return await conn.getStatus(jid);
    if (typeof conn.status === "function") return await conn.status(jid);
    // si no hay función conocida, lanzar para caer en catch
    throw new Error("no-status-fn");
  });
};

const analyzeError = (err) => {
  const out = { isTemporary: false, isPermanent: false, raw: String(err?.message || err) };
  const msg = out.raw.toLowerCase();
  const code = err?.output?.statusCode || err?.status || err?.statusCode || err?.code || null;

  if (/unregister|unregistered|does not exist|no user|not found|404/.test(msg) || code === 404) {
    out.isPermanent = true;
  }
  if (/not-allowed|forbidden|not-authorized|temporar|temporarily|rate limit|retry|403/.test(msg) || code === 403) {
    out.isTemporary = true;
  }
  // algunos mensajes raros: "Contact not in 'on WhatsApp' list" -> permanente
  if (/not on whatsapp|not in whatsapp/i.test(msg)) out.isPermanent = true;

  return out;
};

const computeConfidence = ({ signals }) => {
  // signals: { onWhatsApp, ppExists, presenceOk, statusOk, errorFlags }
  // empezamos base 50 y sumamos/descontamos por evidencia
  let score = 50;
  if (signals.onWhatsApp === true) score += 20;
  if (signals.onWhatsApp === false) score -= 30;

  if (signals.ppExists === true) score += 12;
  if (signals.ppExists === false) score -= 6;

  if (signals.presenceOk === true) score += 18;
  if (signals.presenceOk === false) score -= 8;

  if (signals.statusOk === true) score += 8;
  if (signals.statusOk === false) score -= 4;

  // errores fuertes
  if (signals.errorFlags?.permanent) score -= 45;
  if (signals.errorFlags?.temporary) score -= 25;

  // clamp 0-100
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Math.round(score);
};

let handler = async (m, { conn, args }) => {
  if (!args[0]) return m.reply(`⚠️ *Falta el número*\n\n📌 *Ejemplo:* .verban +52 722 758 4934`);

  const number = args.join(" ").replace(/\D/g, "");
  const jid = number + "@s.whatsapp.net";
  await m.reply(`🔍 *Iniciando verificación exhaustiva para* ${number} ...`);

  // retries + timeouts
  let lastErr = null;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      // lanzar probes en paralelo (cada uno se protege con timeout)
      const [
        onWaRes,
        ppRes,
        presenceRes,
        statusRes
      ] = await Promise.all([
        timeoutPromise(probeOnWhatsApp(conn, jid), DEFAULT_TIMEOUT, "onWhatsApp-timeout"),
        timeoutPromise(probeProfilePic(conn, jid), DEFAULT_TIMEOUT, "pp-timeout"),
        timeoutPromise(probePresence(conn, jid), DEFAULT_TIMEOUT, "presence-timeout"),
        timeoutPromise(probeFetchStatus(conn, jid), DEFAULT_TIMEOUT, "status-timeout")
      ].map(p => p.catch(e => ({ ok: false, error: e })))); // asegurar que no muera todo si uno falla

      // normalizar respuestas
      const waInfo = (onWaRes && onWaRes.ok && Array.isArray(onWaRes.value) && onWaRes.value[0]) ? onWaRes.value[0] : null;
      const onWhatsApp = !!(waInfo && waInfo.exists);
      const ppExists = (ppRes && ppRes.ok && !!ppRes.value);
      const presenceOk = (presenceRes && presenceRes.ok);
      const statusOk = (statusRes && statusRes.ok);

      // Si alguno devolvió error, capturarlo
      const errors = [];
      if (onWaRes && !onWaRes.ok) errors.push(onWaRes.error);
      if (ppRes && !ppRes.ok) errors.push(ppRes.error);
      if (presenceRes && !presenceRes.ok) errors.push(presenceRes.error);
      if (statusRes && !statusRes.ok) errors.push(statusRes.error);

      // compilar banderas de error
      const errorFlags = { temporary: false, permanent: false, raw: [] };
      for (const e of errors) {
        if (!e) continue;
        const a = analyzeError(e);
        if (a.isPermanent) errorFlags.permanent = true;
        if (a.isTemporary) errorFlags.temporary = true;
        errorFlags.raw.push(a.raw);
      }

      // heurísticas fuertes:
      // - si onWhatsApp === false -> probable NO EXISTE / permanente
      // - si presenceOk true -> seguro activo
      // - si presence falla pero onWhatsApp true y ppExists true -> posiblemente activo (menos seguro)
      let decision = "INDETERMINADO";
      const signals = { onWhatsApp, ppExists, presenceOk, statusOk, errorFlags };
      let confidence = computeConfidence({ signals });

      if (!onWhatsApp && errorFlags.permanent) {
        decision = "BLOQUEO PERMANENTE / NO EXISTE";
        confidence = Math.max(confidence, 95);
      } else if (presenceOk) {
        decision = "ACTIVO (NO BANEADO)";
        confidence = Math.max(confidence, 92);
      } else if (errorFlags.temporary && !errorFlags.permanent) {
        decision = "BLOQUEO TEMPORAL";
        confidence = Math.max(confidence, 90);
      } else if (errorFlags.permanent) {
        decision = "BLOQUEO PERMANENTE";
        // si aún tiene foto de perfil, bajamos confianza (podría ser inconsistente)
        confidence = ppExists ? Math.max(confidence, 70) : Math.max(confidence, 96);
      } else if (onWhatsApp && !presenceOk && ppExists) {
        decision = "POSIBLE ACTIVO (sin presencia observada)";
        confidence = Math.max(confidence, 82);
      } else if (onWhatsApp && !ppExists && !presenceOk) {
        decision = "POSIBLE SUSPENSIÓN / CUENTA MUY INACTIVA";
        confidence = Math.max(confidence, 72);
      }

      // preparar respuesta legible
      const reply = [
        `📱 Número: https://wa.me/${number}`,
        ``,
        `${decision === "ACTIVO (NO BANEADO)" ? "🟢" : decision.includes("PERMANENTE") ? "🔴" : decision.includes("TEMPORAL") ? "🟠" : "⚪"} *ESTADO:* ${decision}`,
        `🖼️ Foto de perfil: ${ppExists ? "Sí" : "No"}`,
        `📡 Respuesta a presencia: ${presenceOk ? "Recibida" : "No recibida / error"}`,
        `🔎 onWhatsApp: ${onWhatsApp ? "Sí" : "No"}`,
        `🔍 Señales de error: ${errorFlags.raw.length ? errorFlags.raw.slice(0,3).join(" | ").slice(0,200) : "Ninguna relevante detectada"}`,
        `🔎 *Confianza:* ${confidence}%`
      ].join("\n");

      return m.reply(reply);
    } catch (e) {
      lastErr = e;
      // retry breve
      // no uses setTimeout aquí porque el loop continúa inmediatamente; en caso de retry, solo reintenta
    }
  } // end retries

  // si llegamos aquí, todo falló
  const fallbackMsg = `❌ No se pudo completar la verificación para ${number}.\nError: ${String(lastErr?.message || lastErr || "unknown")}`;
  return m.reply(fallbackMsg);
};

handler.command = /^verban$|^wa$|^checkban$/i;
export default handler;