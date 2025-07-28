// routes/auth.js

import express from 'express'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import emailTemplates from '../public/languages/nb.json' with { type: 'json' } // Adjust the import if necessary
import { logApiCall } from '../services/apiCallLogService.js'
import EmailVerificationToken from '../models/apiCallLogs.js'

dotenv.config()

const router = express.Router()

// Middleware to validate Content-Type and handle JSON parsing errors
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.is('application/json')) {
      return res.status(400).json({ message: 'Invalid Content-Type. Expected application/json.' })
    }
  }
  next()
})

router.use(
  express.json({
    strict: true,
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf.toString())
      } catch (err) {
        throw new SyntaxError('Invalid JSON payload.')
      }
    },
  }),
)

router.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return res.status(400).json({ message: 'Invalid JSON payload.' })
  }
  next(err)
})

router.get('/health', (req, res) => {
  res.send('I am feeling good')
})

//New enpoing GET /api/user/verify-email
// Get the token from the mongdb field emailVerificationToken
// If the token is found, set the field verified to true
// Return a message to the user
router.get('/verify-email', async (req, res) => {
  const token = req.query.token

  // Validate the token parameter
  if (!token) {
    return res.status(400).json({ message: 'Token is required.' })
  }

  // Find the email verification token in the database
  const emailVerificationToken = await EmailVerificationToken.findOne({
    emailVerificationToken: token,
  })

  // If the token is not found, return an error message
  if (!emailVerificationToken) {
    return res.status(404).json({ message: 'Token not found.' })
  }

  // If the token is found, set the verified field to true
  emailVerificationToken.verified = true
  await emailVerificationToken.save()

  // Return a success message to the user
  console.log('Email verified successfully.', emailVerificationToken.email, token)

  res.status(200).json({
    message: 'Email verified successfully.',
    email: emailVerificationToken.email,
    emailVerificationToken: token,
  })
})

router.post('/resend-verification-email', async (req, res) => {
  const email = req.query.email
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' })
  }

  // Find the email verification token in the database
  const emailVerificationToken = await EmailVerificationToken.findOne({ email })

  if (!emailVerificationToken) {
    return res.status(404).json({ message: 'No verification token found for this email.' })
  }

  // Create a transporter for sending emails
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  })

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: 'vegvisr.org@gmail.com',
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: emailTemplates.emailvegvisrorg.verification.subject,
    html: emailTemplates.emailvegvisrorg.verification.body.replace(
      '{verificationLink}',
      `https://test.vegvisr.org/verify-email?token=${emailVerificationToken.emailVerificationToken}`,
    ),
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ message: 'Verification email resent successfully.' })
    console.log('Verification email resent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error resending verification email.' })
  }
})

router.post('/reg-user-vegvisr', async (req, res) => {
  const email = req.query.email
  const role = req.query.role || 'user'
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  const emailVerificationToken = crypto.randomBytes(20).toString('hex')

  // Log the API call
  await logApiCall({
    emailVerificationToken: emailVerificationToken,
    email: email,
    role: role,
    endpoint: '/reg-user-vegvisr',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  // Create a transporter for sending emails
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  })

  // Select email template based on role
  const template =
    role === 'subscriber'
      ? emailTemplates.emailvegvisrorg.subscription
      : emailTemplates.emailvegvisrorg.verification

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: 'vegvisr.org@gmail.com',
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: template.subject,
    html: template.body.replace(
      '{verificationLink}',
      `https://test.vegvisr.org/verify-email?token=${emailVerificationToken}`,
    ),
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ message: 'Verification email sent successfully.' })
    console.log('Verification email sent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error sending verification email.' })
  }
})

router.post('/send-vegvisr-email', async (req, res) => {
  const { email, template, subject, callbackUrl } = req.body
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  if (!email || !template || !subject) {
    return res.status(400).json({ message: 'Email, template, and subject are required.' })
  }

  // Log the API call
  await logApiCall({
    emailVerificationToken: 'custom-email',
    email: email,
    role: 'custom',
    endpoint: '/send-vegvisr-email',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  // Create a transporter for sending emails
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  })

  // Prepare the mail options using custom template
  const mailOptions = {
    from: 'vegvisr.org@gmail.com',
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: subject,
    html: template,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ message: 'Custom email sent successfully.' })
    console.log('Custom email sent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error sending custom email.' })
  }
})

export default router
