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
          <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCI+PHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiBmaWxsPSJyZWQiLz48L3N2Zz4=" alt="Test Logo" style="max-width: 50px;" />
        </body>
      </html>
    `,
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