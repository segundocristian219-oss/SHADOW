import axios from 'axios';

const handler = async (m, { conn, text }) => {
  if (!text) return m.reply(`*💽 Ingresa el nombre de alguna canción en Spotify*`);

  try {
    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key }});

    const apikey = 'Destroy-xyz';
    const baseUrl = 'https://api-adonix.ultraplus.click';
    const res = await axios.get(`${baseUrl}/download/spotify?apikey=${apikey}&q=${encodeURIComponent(text)}`);

    const data = res.data;

    if (!data) return m.reply('❌ La API no respondió correctamente.');
    if (!data.result || data.result.length === 0) return m.reply(`❌ No se encontraron resultados para "${text}" en Spotify.`);

    const song = data.result[0];

    const info = `> *SPOTIFY DOWNLOADER*\n\n🎵 *Título:* ${song.title}\n🎤 *Artista:* ${song.artist}\n🕒 *Duración:* ${song.duration}`;

    if (song.thumbnail) {
      await conn.sendFile(m.chat, song.thumbnail, 'imagen.jpg', info, m);
    } else {
      await conn.sendMessage(m.chat, { text: info });
    }

    if (!song.url) {
      return m.reply('❌ La canción seleccionada no tiene audio disponible.');
    }

    await conn.sendMessage(m.chat, { audio: { url: song.url }, fileName: 'audio.mp3', mimetype: 'audio/mpeg', quoted: m });
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key }});

  } catch (e) {
    console.log(e.response?.data || e.message || e);
    if (e.response?.data) {
      await conn.reply(m.chat, `❌ Error en la API: ${JSON.stringify(e.response.data)}`, m);
    } else {
      await conn.reply(m.chat, '❌ Ocurrió un error inesperado, intenta nuevamente.', m);
    }
  }
};

handler.tags = ['downloader'];
handler.help = ['spotify'];
handler.command = ['spotify'];
export default handler;