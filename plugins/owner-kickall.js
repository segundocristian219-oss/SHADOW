import fs from 'fs';
import path from 'path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import PDFDocument from 'pdfkit';

const handler = async (m, { conn }) => {
  const q = m.quoted;

  if (!q || !q.message) {
    return m.reply("📸 Responde a una *imagen* y usa el comando.");
  }

  // detectar si es imagen
  const img = q.message.imageMessage;
  if (!img) {
    return m.reply("❌ *Ese mensaje no contiene una imagen.*");
  }

  try {
    // carpeta tmp
    const tmp = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

    // descargar imagen
    const stream = await downloadContentFromMessage(img, 'image');
    const imgPath = path.join(tmp, `image_${Date.now()}.jpg`);
    const writer = fs.createWriteStream(imgPath);

    for await (const chunk of stream) writer.write(chunk);
    writer.end();

    await new Promise(res => writer.on('finish', res));

    // convertir la imagen → PDF
    const pdfPath = imgPath.replace(".jpg", ".pdf");
    const doc = new PDFDocument({ autoFirstPage: false });
    const pdfStream = fs.createWriteStream(pdfPath);
    doc.pipe(pdfStream);

    const imgSize = doc.openImage(imgPath);

    // crear página del tamaño de la imagen
    doc.addPage({
      size: [imgSize.width, imgSize.height]
    });

    doc.image(imgPath, 0, 0, { width: imgSize.width, height: imgSize.height });
    doc.end();

    await new Promise(res => pdfStream.on('finish', res));

    // mandar PDF
    await conn.sendMessage(m.chat, {
      document: fs.readFileSync(pdfPath),
      mimetype: "application/pdf",
      fileName: "imagen.pdf"
    }, { quoted: m });

    // limpiar
    fs.unlinkSync(imgPath);
    fs.unlinkSync(pdfPath);

  } catch (e) {
    console.error(e);
    m.reply("❌ *Error al convertir la imagen a PDF.*");
  }
};

handler.command = ["pdf", "img2pdf"];
export default handler;