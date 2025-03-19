// routes/auth.js
import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js'; // Explicit path for ES6
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

async function sendEmailWithMailComposer(email, token) {
  const emailVerificationToken = token || crypto.randomBytes(20).toString('hex');

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

  const mail = new MailComposer(mailOptions);

  try {
    const message = await new Promise((resolve, reject) => {
      mail.compile().build((err, msg) => {
        if (err) return reject(err);
        resolve(msg);
      });
    });

    const info = await transporter.sendMail({
      from: mailOptions.from,
      to: mailOptions.to,
      raw: message,
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
    const result = await sendEmailWithMailComposer(email);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;