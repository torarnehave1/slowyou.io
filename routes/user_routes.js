// routes/auth.js

import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import emailTemplates from '../public/languages/nb.json' with { type: 'json' }; // Adjust the import if necessary

dotenv.config();

const router = express.Router();

router.post('/reg-user-vegvisr', async (req, res) => {
  const { email, token } = req.body;

  // Validate the API token
  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token);

   // return res.status(401).send('Unauthorized', token);
  }

  // Generate a new email verification token
  const emailVerificationToken = crypto.randomBytes(20).toString('hex');

  // Create a transporter for sending emails
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: 'vegvisr.org@gmail.com',
    to: email,
    subject: emailTemplates.emailvegvisrorg.verification.subject,
    html: emailTemplates.emailvegvisrorg.verification.body.replace(
      '{verificationLink}',
      `https://slowyou.net/a/verify-email?token=${emailVerificationToken}`
    ),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    // Optionally log info.response if needed
    res.status(200).json({ message: 'Verification email sent successfully.' });
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error sending verification email.' });
  }
});

export default router;
