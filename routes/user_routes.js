import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
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

  const mailOptions = {
    from: 'vegvisr.org@gmail.com',
    to: email,
    subject: emailTemplates.emailvegvisrorg.verification.subject,
    html: emailTemplates.emailvegvisrorg.verification.body.replace(
      '{verificationLink}',
      `https://slowyou.net/a/verify-email?token=${emailVerificationToken}`
    ).replace(
      'https://slowyou.io/images/logo.svg',
      'cid:vegvisr-logo'
    ),
    attachments: [
      {
        filename: 'logo.svg',
        path: 'https://slowyou.io/images/logo.svg', // Direct URL works with Nodemailer
        cid: 'vegvisr-logo', // Must match the CID in the HTML
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