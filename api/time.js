// api/time.js
import moment from 'moment-timezone';

export default function handler(request, response) {
  const serverTimezone = 'Asia/Karachi'; // The desired timezone

  try {
    // Get the current time in the specified timezone
    const serverTime = moment.tz(serverTimezone);

    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Send the formatted time back to the client
    response.status(200).json({
      datetime: serverTime.toISOString(),
    });

  } catch (error) {
    console.error('Error in /api/time:', error);
    response.status(500).json({ error: 'Failed to get server time.' });
  }
}

