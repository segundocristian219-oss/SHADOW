import fetch from 'node-fetch';

const handler = async (msg, { conn, args, command }) => {
  const chatId = msg.key.remoteJid;
  const text = args.join(" ");
  const pref = global.prefixes?.[0] || ".";

  if (!text) {
    return conn.sendMessage(chatId, {
      text: `⚠️ *Uso incorrecto del comando.*\n\n📌 *Ejemplo:*  
${pref}${command} https://open.spotify.com/track/3NDEO1QeVlxskfRHHGm7KS  
${pref}${command} Bad Bunny Monaco`
    }, { quoted: msg });
  }

  await conn.sendMessage(chatId, {
    react: { text: '⏳', key: msg.key }
  });

  try {
    let trackUrl = text;

    // 🔍 Si no es link → buscar
    if (!/^https?:\/\/(www\.)?open\.spotify\.com\/track\//.test(text)) {
      const searchUrl = `https://api.neoxr.eu/api/spotify-search?query=${encodeURIComponent(text)}&apikey=russellxz`;
      const s = await fetch(searchUrl);
      const sjson = await s.json();

      if (!sjson.status || !sjson.data || sjson.data.length === 0)
        throw new Error("No se encontraron resultados en Spotify.");

      trackUrl = sjson.data[0].url; // primera canción encontrada
    }

    // Obtener info y descargar
    const apiUrl = `https://api.neoxr.eu/api/spotify?url=${encodeURIComponent(trackUrl)}&apikey=russellxz`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);

    const data = await response.json();
    if (!data.status || !data.data || !data.data.url)
      throw new Error("No se pudo obtener el enlace de descarga.");

    const song = data.data;

    const caption =
      `𖠁 *Título:* ${song.title}\n` +
      `𖠁 *Artista:* ${song.artist.name}\n` +
      `𖠁 *Duración:* ${song.duration}\n` +
      `𖠁 *Enlace:* ${song.url}\n\n────────────\n🎧 _La Suki Bot_`;

    await conn.sendMessage(chatId, {
      image: { url: song.thumbnail },
      caption
    }, { quoted: msg });

    const audioRes = await fetch(song.url);
    if (!audioRes.ok) throw new Error("No se pudo descargar el audio.");

    const audioBuffer = await audioRes.arrayBuffer(); // moderno
    await conn.sendMessage(chatId, {
      audio: Buffer.from(audioBuffer),
      mimetype: 'audio/mpeg',
      fileName: `${song.title}.mp3`
    }, { quoted: msg });

    await conn.sendMessage(chatId, {
      react: { text: '✅', key: msg.key }
    });

  } catch (err) {
    console.error("❌ Error en .spotify:", err);

    await conn.sendMessage(chatId, {
      text: `❌ *Error:* _${err.message}_`
    }, { quoted: msg });

    await conn.sendMessage(chatId, {
      react: { text: '❌', key: msg.key }
    });
  }
};

handler.command = ["spotify"];
export default handler;