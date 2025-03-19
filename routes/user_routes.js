const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const dotenv = require('dotenv');
const emailTemplates = require('../public/languages/nb.json'); // Adjust path as needed

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

async function sendEmailWithMailComposer(email, token) {
  // Generate a unique verification token
  const emailVerificationToken = token || require('crypto').randomBytes(20).toString('hex');

  // Define mail options
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

  // Create a new MailComposer instance
  const mail = new MailComposer(mailOptions);

  try {
    // Build the raw message
    const message = await new Promise((resolve, reject) => {
      mail.compile().build((err, msg) => {
        if (err) return reject(err);
        resolve(msg);
      });
    });

    // Send the raw message using Nodemailer’s SMTP transport
    const info = await transporter.sendMail({
      from: mailOptions.from,
      to: mailOptions.to,
      raw: message, // Use the raw RFC822 message
    });

    console.log('Email sent:', info.response);
    return { success: true, message: 'Verification email sent successfully.' };
  } catch (error) {
    console.error('Error:', error);
    throw new Error('Error sending verification email.');
  }
}

// Example usage in your route
const express = require('express');
const router = express.Router();

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

module.exports = router;