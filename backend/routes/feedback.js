// backend/routes/feedback.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Create transporter (using Gmail as example, you can use any email service)
const createTransport = () => {
  return nodemailer.createTransport({
    service: 'gmail', // or 'outlook', 'yahoo', etc.
    auth: {
      user: 'storysoundsai@gmail.com', // Your email
      pass: process.env.EMAIL_PASS  // App password (not your regular password)
    }
  });
};

// POST /api/feedback
router.post('/', async (req, res) => {
  try {
    const { feedback, email, timestamp } = req.body;

    // Validate required fields
    if (!feedback || feedback.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Feedback message is required' 
      });
    }

    // Create email content
    const emailContent = {
      from: 'storysoundsai@gmail.com',
      to: 'storysoundsai@gmail.com',
      subject: 'New Feedback from StorySound App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #1ed760; padding-bottom: 10px;">
            New Feedback Received
          </h2>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #555; margin-top: 0;">Feedback Message:</h3>
            <p style="font-size: 16px; line-height: 1.6; color: #333; white-space: pre-wrap;">${feedback}</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #555; margin-top: 0;">User Information:</h4>
            <p><strong>Email:</strong> ${email || 'Not provided'}</p>
            <p><strong>Timestamp:</strong> ${timestamp || new Date().toLocaleString()}</p>
            <p><strong>Source:</strong> StorySound Feedback Modal</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
            <p>This feedback was submitted through the StorySound application feedback form.</p>
          </div>
        </div>
      `
    };

    // Create transporter and send email
    const transporter = createTransport();
    
    console.log('📧 Sending feedback email...');
    await transporter.sendMail(emailContent);
    console.log('✅ Feedback email sent successfully');

    // Success response
    res.json({ 
      success: true, 
      message: 'Feedback sent successfully' 
    });

  } catch (error) {
    console.error('❌ Error sending feedback email:', error);
    
    // Check for specific email errors
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      return res.status(500).json({ 
        success: false, 
        error: 'Email authentication failed. Please check email configuration.' 
      });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(500).json({ 
        success: false, 
        error: 'Email service unavailable. Please try again later.' 
      });
    }

    // Generic error response
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send feedback. Please try again later.' 
    });
  }
});

// Health check endpoint
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Feedback route is working',
    emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
  });
});

module.exports = router;