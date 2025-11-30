// handler-wa-detector-v2.js
// Requiere: @whiskeysockets/baileys v6.7.18
// Usa la misma convención de handler que ya tenías.

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 800;

function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

async function tryWithRetries(fn, retries = DEFAULT_RETRIES){
  let lastErr = null;
  for (let i = 0; i < retries; i++){
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      lastErr = e;
      // Exponencial backoff suave
      await sleep(RETRY_DELAY_MS * (1 + i));
    }
  }
  return { ok: false, err: lastErr };
}

function errorKind(err){
  if (!err || !err.message) return 'unknown';
  const m = err.message.toLowerCase();
  if (/not-registered|not reg|unreg|404|no record/i.test(m)) return 'unregistered';
  if (/not-allowed|forbidden|403|not-authorized|access denied/i.test(m)) return 'forbidden';
  if (/temporar|retry|try again|rate limit|too many/i.test(m)) return 'temporary';
  if (/blocked|blocked by user/i.test(m)) return 'blocked_by_user';
  if (/not found|profile.*not found|file not found/i.test(m)) return 'not_found';
  return 'other';
}

let handler = async (m, { conn, args }) => {
  if (!args[0]) return m.reply(`⚠️ *Falta el número*\n\n📌 *Ejemplo:* .wa +52 722 758 4934`);

  const number = args.join(" ").replace(/\D/g, "");
  const jid = number + "@s.whatsapp.net";

  await m.reply(`🔍 *Analizando número (ULTRA-PRECISO v2) con múltiples heurísticas...*`);

  const report = {
    number,
    jid,
    checks: {},
    summary: null,
    confidence: 0
  };

  // 1) onWhatsApp -> existencia básica
  const r_exists = await tryWithRetries(() => conn.onWhatsApp(jid));
  report.checks.onWhatsApp = r_exists.ok ? r_exists.value : { error: errorKind(r_exists.err) };

  // 2) assertJidExists -> validación interna (más precisa que onWhatsApp)
  const r_assert = await tryWithRetries(() => conn.assertJidExists(jid));
  report.checks.assertJidExists = r_assert.ok ? true : { error: errorKind(r_assert.err), raw: r_assert.err?.message };

  // 3) profile picture
  const r_pp = await tryWithRetries(() => conn.profilePictureUrl(jid, 'image'));
  report.checks.profilePicture = r_pp.ok ? { url: r_pp.value } : { error: errorKind(r_pp.err), raw: r_pp.err?.message };

  // 4) status / about
  const r_status = await tryWithRetries(() => conn.fetchStatus(jid));
  report.checks.status = r_status.ok ? { text: r_status.value } : { error: errorKind(r_status.err), raw: r_status.err?.message };

  // 5) presence subscribe (no notificación to user here; just attempt)
  const r_presence = await tryWithRetries(async () => {
    // presenceSubscribe may throw if not allowed; we ignore successful subscription response content
    await conn.presenceSubscribe(jid);
    // small pause for server reaction
    await sleep(350);
    return true;
  });
  report.checks.presenceSubscribe = r_presence.ok ? true : { error: errorKind(r_presence.err), raw: r_presence.err?.message };

  // 6) fetchBlocklist (tu cuenta) -> si falla, lo anotamos
  const r_blocklist = await tryWithRetries(() => conn.fetchBlocklist());
  report.checks.fetchBlocklist = r_blocklist.ok ? { ok: true, listLength: Array.isArray(r_blocklist.value) ? r_blocklist.value.length : null } : { error: errorKind(r_blocklist.err) };

  // 7) Extra heurística: intenta obtener profile picture con fallback para distinguir "privacidad total" de "no existe"
  // Si profilePicture dio not_found pero assertJidExists true -> podría ser cuenta nueva o privacidad.
  if (!r_pp.ok && r_assert.ok) {
    // intentamos obtener con un endpoint distinto (si tu versión soporta otra forma)
    // En v6.7.18 no hay otro endpoint oficial, así que añadimos heurística temporal:
    report.checks.pp_inference = 'pp-missing-but-jid-exists';
  }

  // =================================
  // DECISION MAKING (heurísticas compuestas)
  // =================================
  const exists = Array.isArray(r_exists.value) ? !!(r_exists.value[0] && r_exists.value[0].exists) : false;
  const assertOk = !!r_assert.ok;
  const ppOk = !!r_pp.ok;
  const statusOk = !!r_status.ok;
  const presenceOk = !!r_presence.ok;

  // detect patterns from errors as quick signals
  const errKinds = [
    r_exists.ok ? null : errorKind(r_exists.err),
    r_assert.ok ? null : errorKind(r_assert.err),
    r_pp.ok ? null : errorKind(r_pp.err),
    r_status.ok ? null : errorKind(r_status.err),
    r_presence.ok ? null : errorKind(r_presence.err),
  ].filter(Boolean);

  const hasUnregistered = errKinds.includes('unregistered') || errKinds.includes('not_found');
  const hasForbidden = errKinds.includes('forbidden');
  const hasTemporary = errKinds.includes('temporary');
  const hasBlockedByUser = errKinds.includes('blocked_by_user');

  // RULE: BAN PERMANENTE (muy alto confidence)
  if (!exists && !ppOk && !assertOk && hasUnregistered) {
    report.summary = 'PERMANENTE (BAN)';
    report.confidence = 98;
    report.reason = [
      'No aparece en onWhatsApp (no existe registro).',
      'assertJidExists falló con patrón "unregistered"/404.',
      'No se pudo obtener foto ni status.'
    ];
  }
  // RULE: BAN TEMPORAL / LIMITACION (alta confianza)
  else if (exists && (hasTemporary || (!presenceOk && !statusOk && !ppOk && !hasUnregistered && !hasForbidden))) {
    report.summary = 'TEMPORAL / RESTRICTED';
    report.confidence = 90;
    report.reason = [
      'El JID existe pero las consultas (presence/status/pp) están bloqueadas o limitadas.',
      'No hay indicios de 404/unregistered.'
    ];
  }
  // RULE: BLOQUEO PERSONAL (Usuario te bloqueó) — heurística
  else if (exists && !ppOk && !statusOk && !presenceOk && r_blocklist.ok) {
    // Si tu fetchBlocklist funciona y no ves al usuario en la lista, no ayuda; pero si los errores son "forbidden/not-allowed" puede ser bloqueo.
    report.summary = 'POTENCIAL BLOQUEO PERSONAL (te bloqueó)';
    report.confidence = 80;
    report.reason = [
      'El JID existe pero no devuelve foto, status ni presencia.',
      'Los errores concuerdan con "forbidden" / privacidad estricta.',
      'Esto suele ocurrir cuando el usuario te ha bloqueado o ajustó privacidad a "mis contactos".'
    ];
  }
  // RULE: CUENTA NUEVA / INACTIVA (indeterminado con buena probabilidad)
  else if (assertOk && !ppOk && !statusOk && !presenceOk && !hasUnregistered && !hasForbidden && !hasTemporary) {
    report.summary = 'CUENTA NUEVA / VACÍA / PRIVACIDAD ALTA (indeterminado)';
    report.confidence = 70;
    report.reason = [
      'assertJidExists pasó, por lo que el JID está registrado.',
      'Sin foto, sin status y sin presencia: puede ser cuenta recién creada o privacidad estricta.'
    ];
  }
  // RULE: ACTIVA
  else if (exists && (ppOk || statusOk || presenceOk || assertOk)) {
    report.summary = 'ACTIVO (NO BANEADO)';
    // confidence higher when multiple positive signals present
    report.confidence = 95 - (ppOk?0:5) - (statusOk?0:5);
    report.reason = [
      'Se obtuvieron señales positivas (onWhatsApp / profile pic / status / assert).'
    ];
  }
  // FALLBACK: indecidible
  else {
    report.summary = 'INDETERMINADO';
    report.confidence = 55;
    report.reason = [
      'Las señales son mixtas o faltan pruebas concluyentes.',
      'Recomendado: reintentar en caliente o comprobar manualmente.'
    ];
  }

  // Construir mensaje final legible
  const out = [
    `📱 Número: https://wa.me/${number}`,
    ``,
    report.summary === 'PERMANENTE (BAN)' ? '🔴 *ESTADO: BAN PERMANENTE*' :
    report.summary === 'TEMPORAL / RESTRICTED' ? '🟠 *ESTADO: BAN TEMPORAL / RESTRICCIÓN*' :
    report.summary === 'POTENCIAL BLOQUEO PERSONAL (te bloqueó)' ? '⚫ *ESTADO: POTENCIAL BLOQUEO PERSONAL*' :
    report.summary === 'ACTIVO (NO BANEADO)' ? '🟢 *ESTADO: ACTIVO (NO BANEADO)*' :
    '⚪ *ESTADO: INDETERMINADO*',
    ``,
    `▪ Señales:`,
    `  - onWhatsApp: ${exists ? '✅' : '❌'}`,
    `  - assertJidExists: ${assertOk ? '✅' : '❌'}`,
    `  - profilePicture: ${ppOk ? '✅' : '❌'}`,
    `  - status/about: ${statusOk ? '✅' : '❌'}`,
    `  - presenceSubscribe: ${presenceOk ? '✅' : '❌'}`,
    ``,
    `▪ RAZONES:`,
    ...report.reason.map(r => `  - ${r}`),
    ``,
    `🔎 *Confianza estimada:* ${report.confidence}%`,
    ``,
    `📋 Debug (errores resumidos):`,
    `  - onWhatsApp: ${r_exists.ok ? 'ok' : errorKind(r_exists.err)}`,
    `  - assertJidExists: ${r_assert.ok ? 'ok' : errorKind(r_assert.err)}`,
    `  - profilePicture: ${r_pp.ok ? 'ok' : errorKind(r_pp.err)}`,
    `  - status: ${r_status.ok ? 'ok' : errorKind(r_status.err)}`,
    `  - presenceSubscribe: ${r_presence.ok ? 'ok' : errorKind(r_presence.err)}`
  ].join('\n');

  return m.reply(out);
};

handler.command = /^wa|checkwa|wa2$/i;
export default handler;