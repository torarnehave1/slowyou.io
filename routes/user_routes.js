import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import emailTemplates from '../public/languages/nb.json' with { type: 'json' };

dotenv.config();

const router = express.Router();

router.post('/reg-user-vegvisr', async (req, res) => {
  const { email, token } = req.body;

  if (token !== process.env.VEGVISR_API_TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  const emailVerificationToken = crypto.randomBytes(20).toString('hex');

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const svgContent = fs.readFileSync('public/images/logo.svg');
  const base64Image = Buffer.from(svgContent).toString('base64');
  const logoDataUrl = `data:image/svg+xml;base64,${base64Image}`;

  const mailOptions = {
    from: 'vegvisr.org@gmail.com',
    to: email,
    subject: emailTemplates.emailvegvisrorg.verification.subject,
    html: `
      <html>
        <body>
          <p>Hei,</p>
          <p>Velkommen til Vegvisr.org! Klikk her for å bekrefte: <a href="https://slowyou.net/a/verify-email?token=${emailVerificationToken}">Bekreft e-post</a></p>
          <p>Med retning og klarhet,<br>Vegvisr.org-teamet</p>
          <img src="cid:test-logo" alt="Test Logo" style="max-width: 50px;" />
        </body>
      </html>
    `,
    attachments: [
      {
        filename: 'red_square.png',
        content: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVFhH7c6xDQAACAMwT/X/Pw0MDEyD3jAwMTB+AQYGBgYGBgYGBgYGBgYGBgYGBgbgBwYGBuYFMFURAAAAAElFTkSuQmCC', 'base64'),
        cid: 'test-logo',
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Verification email sent successfully.' });
  } catch (mailError) {
    console.error('Mail error:', mailError);
    res.status(500).json({ message: 'Error sending verification email.' });
  }
});

export default router;