import { NextApiRequest, NextApiResponse } from 'next';
import { join } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';
import JSZip from 'jszip';

const PDFDocument = require('pdfkit');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { instrument, notes, imageSize } = req.body;
    const doc = new PDFDocument({ margin: 30 });
    const buffers: any[] = [];
    
    doc.on('data', (chunk: any) => buffers.push(chunk));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${instrument}-tablature.pdf"`);
      res.send(pdfData);
    });

    // Настройки PDF
    const pageWidth = doc.page.width - 60;
    let x = 30;
    let y = 30;
    const spacing = 5;
    const imgSize = imageSize * 0.75; // Уменьшаем размер для PDF

    for (const note of notes) {
      // Проверяем, помещается ли изображение на текущей строке
      if (x + imgSize > pageWidth) {
        x = 30;
        y += imgSize + 20;
        
        // Проверяем, нужна ли новая страница
        if (y + imgSize > doc.page.height - 30) {
          doc.addPage();
          y = 30;
        }
      }

      // Добавляем длительность ноты
      doc.fontSize(12)
         .text(note.duration.toString(), x + imgSize/2, y - 15, { align: 'center' });

      // Получаем путь к изображению
      const imagePath = join(process.cwd(), 'public', 'tabs', instrument, `${note.image}.png`);
      const fallbackPath = join(process.cwd(), 'public', 'tabs', 'NO_notes.png');
      
      // Если изображение не найдено, используем заглушку
      if (existsSync(imagePath)) {
        doc.image(imagePath, x, y, { width: imgSize, height: imgSize });
      } else if (existsSync(fallbackPath)) {
        doc.image(fallbackPath, x, y, { width: imgSize, height: imgSize });
      } else {
        doc.rect(x, y, imgSize, imgSize).stroke();
        doc.text('Image missing', x, y + imgSize/2);
      }

      x += imgSize + spacing;
    }

    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}