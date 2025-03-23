// routes/auth.js

import express from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import emailTemplates from '../public/languages/nb.json' with { type: 'json' }; // Adjust the import if necessary
import { logApiCall } from '../services/apiCallLogService.js';

dotenv.config();

const router = express.Router();

router.get('/Maiken', (req, res) => {
  res.send('Hei på deg Maiken');
});


//New enpoing GET /api/user/verify-email
// Get the token from the mongdb field emailVerificationToken
// If the token is found, set the field verified to true
// Return a message to the user
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  // Validate the token
  if (!token) {
    return res.status(400).json({ message: 'Token is required.' });
  }

  // Find the emailVerificationToken collection logApiCall in the  by the email verification token
  
  const emailVerificationToken = await logApiCall.findOne({
    emailVerificationToken: token,
  });

  // If the token is not found, return an error message
  if (!emailVerificationToken) {
    return res.status(404).json({ message: 'Token not found.' });
  }

  // If the token is found, set the verified field to true
  emailVerificationToken.verified = true;
  await emailVerificationToken.save();

  // Return a success message
  res.status(200).json({ message: 'Email verified successfully.' });
});



router.post('/reg-user-vegvisr', async (req, res) => {
  const { email, token } = req.body;

  // Log the API call
  await logApiCall({
    emailVerificationToken: req.body.token,
    email: req.body.email,
    endpoint: '/reg-user-vegvisr',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

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
      `https://test.vegvisr.io/verify-email?token=${emailVerificationToken}`
    ),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    // Optionally log info.response if needed
    res.status(200).json({ message: 'Verification email sent successfully.' });
 console.log('Verification email sent successfully.', info.response);
 
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error sending verification email.' });
  }
});

export default router;
