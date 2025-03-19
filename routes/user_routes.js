// routes/auth.js
import express from 'express';
import { randomBytes } from 'crypto'; // Correct ES6 import for randomBytes
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import emailTemplates from '../public/languages/nb.json' with { type: 'json' }; // Adjust path as needed

dotenv.config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function sendRawEmail(email, token) {
  const emailVerificationToken = token || randomBytes(20).toString('hex'); // Use randomBytes from crypto
  const boundary = `----=_Part_${Date.now()}`;

  const rawMessage = `
From: vegvisr.org@gmail.com
To: ${email}
Subject: Bekreft din reise med Vegvisr.org
MIME-Version: 1.0
Content-Type: multipart/related; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html>
  <body>
    <p>Hei,</p>
    <p>Velkommen til Vegvisr.org! Klikk her for =C3=A5 bekrefte: <a href=3D"https://slowyou.net/a/verify-email?token=3D${emailVerificationToken}">Bekreft e-post</a></p>
    <p>Med retning og klarhet,<br>Vegvisr.org-teamet</p>
    <img src=3D"cid:test-logo" alt=3D"Test Logo" style=3D"max-width: 50px;" />
  </body>
</html>

--${boundary}
Content-Type: image/png; name="red_square.png"
Content-ID: <test-logo>
Content-Transfer-Encoding: base64
Content-Disposition: inline; filename="red_square.png"

iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAySURBVFhH7c6xDQAACAMwT/X/Pw0MDEyD3jAwMTB+AQYGBgYGBgYGBgYGBgYGBgYGBgbgBwYGBuYFMFURAAAAAElFTkSuQmCC

--${boundary}--
  `.trim();

  try {
    const info = await transporter.sendMail({
      raw: rawMessage,
    });
    console.log('Email sent:', info.response);
    return { success: true, message: 'Verification email sent successfully.' };
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Error sending verification email.');
  }
}

router.post('/reg-user-vegvisr', async (req, res) => {
  const { email, token } = req.body;

  if (token !== process.env.VEGVISR_API_TOKEN) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const result = await sendRawEmail(email);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;