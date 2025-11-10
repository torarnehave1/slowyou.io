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

// Helper functions for multi-sender email support
function parseApprovedSenders() {
  const senderConfigs = {}
  const sendersString = process.env.APPROVED_SENDERS || ''
  
  sendersString.split(',').forEach(pair => {
    const [email, password] = pair.trim().split(':')
    if (email && password) {
      senderConfigs[email] = password
    }
  })
  
  return senderConfigs
}

function isApprovedSender(email) {
  const configs = parseApprovedSenders()
  return configs.hasOwnProperty(email)
}

function getPasswordForSender(email) {
  const configs = parseApprovedSenders()
  return configs[email]
}

function createTransporterForSender(email) {
  if (!isApprovedSender(email)) {
    throw new Error(`Sender '${email}' not found in approved list`)
  }
  
  return nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: email,
      pass: getPasswordForSender(email),
    },
  })
}

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

// New endpoint to list available senders
router.get('/available-senders', (req, res) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }

  const configs = parseApprovedSenders()
  const availableSenders = Object.keys(configs).map(email => ({
    email: email,
    isDefault: email === process.env.EMAIL_USERNAME
  }))

  res.json({
    defaultSender: process.env.EMAIL_USERNAME,
    availableSenders: availableSenders,
    totalSenders: availableSenders.length
  })
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
  const senderEmail = req.body.senderEmail || req.query.senderEmail
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

  // Create transporter based on sender preference
  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    // Use default configuration
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: fromEmail,
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
    res.status(200).json({ 
      message: 'Verification email resent successfully.',
      sentFrom: fromEmail
    })
    console.log('Verification email resent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error resending verification email.' })
  }
})

router.post('/reg-user-vegvisr', async (req, res) => {
  const email = req.query.email
  const role = req.query.role || 'user'
  const senderEmail = req.body.senderEmail || req.query.senderEmail
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

  // Create transporter based on sender preference
  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    // Use default configuration
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  // Select email template based on role
  const template =
    role === 'subscriber'
      ? emailTemplates.emailvegvisrorg.subscription
      : emailTemplates.emailvegvisrorg.verification

  // Prepare the mail options (adjust the template paths as necessary)
  const mailOptions = {
    from: fromEmail,
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
    res.status(200).json({ 
      message: 'Verification email sent successfully.',
      sentFrom: fromEmail
    })
    console.log('Verification email sent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    res.status(500).json({ message: 'Error sending verification email.' })
  }
})

router.post('/send-vegvisr-email', async (req, res) => {
  const { email, template, subject, callbackUrl, variables, senderEmail } = req.body
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized')
  }

  const token = authHeader.split(' ')[1]

  if (token !== process.env.VEGVISR_API_TOKEN) {
    console.log('Unauthorized access attempt', token)
    return res.status(401).send('Unauthorized')
  }


  const emailVerificationToken = crypto.randomBytes(20).toString('hex');
  
  // Only process affiliateRegistrationUrl if variables exists and has the property
  if (variables && variables.affiliateRegistrationUrl) {
    const completeUrl = `${variables.affiliateRegistrationUrl}&token=${emailVerificationToken}`;
    variables.affiliateRegistrationUrl = completeUrl;
  }

  if (!email || !template || !subject) {
    return res.status(400).json({ message: 'Email, template, and subject are required.' })
  }  // Log the API call
  await logApiCall({
    emailVerificationToken: emailVerificationToken,
    email: email,
    role: 'custom',
    endpoint: '/send-vegvisr-email',
    method: 'POST',
    params: req.body,
    headers: req.headers,
    timestamp: new Date(),
  })

  // Create transporter based on sender preference
  let transporter
  let fromEmail = 'vegvisr.org@gmail.com' // default

  if (senderEmail) {
    if (!isApprovedSender(senderEmail)) {
      return res.status(400).json({ message: `Sender '${senderEmail}' not found in approved list` })
    }
    transporter = createTransporterForSender(senderEmail)
    fromEmail = senderEmail
  } else {
    // Use default configuration
    transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }

  // Build callback URL with email verification token and affiliate token
 // const affiliateToken = variables?.invitationToken || variables?.affiliateToken || ''
//  const callbackUrlWithParams = `https://www.vegvisr.org/verify-email/?token=${emailVerificationToken}&affiliateToken=${affiliateToken}`
  
  // Process template with variables if provided
  let processedTemplate = template
  let processedSubject = subject
  
  // Replace double-brace placeholders with actual email verification token (if any)
 // processedTemplate = processedTemplate.replace(/\{\{EMAIL_VERIFICATION_TOKEN\}\}/g, emailVerificationToken)
 // processedSubject = processedSubject.replace(/\{\{EMAIL_VERIFICATION_TOKEN\}\}/g, emailVerificationToken)
  
  if (variables && typeof variables === 'object') {
    
    // Replace variables in template: {variableName} -> value
    Object.keys(variables).forEach(key => {
      const placeholder = `{${key}}`
      processedTemplate = processedTemplate.replace(new RegExp(placeholder, 'g'), variables[key])
      processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), variables[key])
    })
  }

  // Prepare the mail options using processed template
  const mailOptions = {
    from: fromEmail,
    to: email,
    cc: 'slowyou.net@gmail.com',
    subject: processedSubject,
    html: processedTemplate,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    // Optionally log info.response if needed
    res.status(200).json({ 
      message: 'Custom email sent successfully.',
      processedTemplate: processedTemplate, // For debugging
      processedSubject: processedSubject,     // For debugging
      emailVerificationToken: emailVerificationToken, // For debugging
      sentFrom: fromEmail
    })
    console.log('Custom email sent successfully.', info.response)
  } catch (mailError) {
    // Log the error if needed
    console.error('Email sending error:', mailError)
    res.status(500).json({ message: 'Error sending custom email.' })
  }
})

router.post('/send-email-custom-credentials', async (req, res) => {
  const { senderEmail, toEmail, subject, body } = req.body
  
  // Check for API token first
  const apiToken = req.headers['x-api-token'] || req.headers['x-app-token']
  
  if (!apiToken) {
    return res.status(401).json({ 
      message: 'API token required. Include X-API-Token or X-App-Token header.' 
    })
  }
  
  if (apiToken !== process.env.VEGVISR_API_TOKEN) {
    return res.status(401).json({ 
      message: 'Invalid API token.' 
    })
  }
  
  // Get app password from Authorization header
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ 
      message: 'Authorization header required. Use Basic authentication with app password.' 
    })
  }

  // Extract app password from Basic auth (format: Basic base64(email:appPassword))
  let appPassword
  try {
    const base64Credentials = authHeader.split(' ')[1]
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    const [authEmail, authPassword] = credentials.split(':')
    
    // Verify that the email in auth matches senderEmail
    if (authEmail !== senderEmail) {
      return res.status(401).json({ 
        message: 'Email in Authorization header must match senderEmail in request body' 
      })
    }
    
    appPassword = authPassword
  } catch (error) {
    return res.status(401).json({ 
      message: 'Invalid Authorization header format. Use Basic authentication.' 
    })
  }

  // Validate required fields
  if (!senderEmail || !toEmail || !subject || !body) {
    return res.status(400).json({ 
      message: 'All fields are required: senderEmail, toEmail, subject, body' 
    })
  }

  if (!appPassword) {
    return res.status(401).json({ 
      message: 'App password is required in Authorization header' 
    })
  }

  // Validate email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(senderEmail)) {
    return res.status(400).json({ message: 'Invalid sender email format' })
  }
  if (!emailRegex.test(toEmail)) {
    return res.status(400).json({ message: 'Invalid recipient email format' })
  }

  try {
    // Create transporter with provided credentials
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: senderEmail,
        pass: appPassword,
      },
    })

    // Prepare mail options
    const mailOptions = {
      from: senderEmail,
      to: toEmail,
      subject: subject,
      html: body,
    }

    // Send email
    const info = await transporter.sendMail(mailOptions)
    
    // Log successful send
    console.log('Email sent with custom credentials:', info.response)
    
    res.status(200).json({ 
      message: 'Email sent successfully.',
      messageId: info.messageId,
      sentFrom: senderEmail,
      sentTo: toEmail
    })
  } catch (error) {
    console.error('Error sending email with custom credentials:', error)
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      return res.status(401).json({ 
        message: 'Authentication failed. Please check your email and app password.' 
      })
    }
    
    res.status(500).json({ 
      message: 'Error sending email.',
      error: error.message 
    })
  }
})

export default router
