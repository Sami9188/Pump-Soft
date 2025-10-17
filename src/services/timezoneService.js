import moment from 'moment-timezone';

// Default server timezone - you can configure this based on your server location
const DEFAULT_SERVER_TIMEZONE = 'Asia/Karachi'; // Paki    fetchServerTime: async () => {
        try {
            // Fetch time from our own serverless function proxy
            const response = await fetch('/api/time');
            if (!response.ok) {
                throw new Error(`Failed to fetch time: ${response.statusText}`);
            }
            const data = await response.json();
            // The 'datetime' property from the API is an ISO 8601 string
            return moment.tz(data.datetime, serverTimezone);
        } catch (error) {
            console.error('Error fetching server time, falling back to local time.', error);
            // Fallback to local time if API fails
            return moment.tz(serverTimezone);
        }
    }djust as needed

// Global timezone configuration
let serverTimezone = DEFAULT_SERVER_TIMEZONE;

export const TimezoneService = {
    /**
     * Set the server timezone
     * @param {string} timezone - IANA timezone identifier (e.g., 'Asia/Karachi', 'UTC')
     */
    setServerTimezone: (timezone) => {
        if (!timezone) {
            console.warn('No timezone provided, using default:', DEFAULT_SERVER_TIMEZONE);
            return;
        }

        // Validate timezone
        if (!moment.tz.zone(timezone)) {
            console.error(`Invalid timezone: ${timezone}. Using default: ${DEFAULT_SERVER_TIMEZONE}`);
            serverTimezone = DEFAULT_SERVER_TIMEZONE;
            return;
        }

        serverTimezone = timezone;
        console.log(`Server timezone set to: ${timezone}`);
    },

    /**
     * Get the current server timezone
     * @returns {string} Current server timezone
     */
    getServerTimezone: () => serverTimezone,

    /**
     * Create a new Date object in server timezone
     * @param {string|Date|number} input - Date input (ISO string, Date object, or timestamp)
     * @returns {Date} Date object adjusted to server timezone
     */
    createServerDate: (input) => {
        if (!input) {
            return moment.tz(serverTimezone).toDate();
        }

        return moment.tz(input, serverTimezone).toDate();
    },

    /**
     * Get current moment in server timezone
     * @returns {moment} Moment object in server timezone
     */
    getCurrentMoment: () => moment.tz(serverTimezone),

    /**
     * Convert any date to server timezone moment
     * @param {string|Date|number} input - Date input
     * @param {string} format - Optional format string for parsing
     * @returns {moment} Moment object in server timezone
     */
    toServerMoment: (input, format) => {
        if (!input) return moment.tz(serverTimezone);

        // If input is already a moment object
        if (moment.isMoment(input)) {
            return input.clone().tz(serverTimezone);
        }

        if (format) {
            return moment.tz(input, format, serverTimezone);
        }

        return moment.tz(input, serverTimezone);
    },

    /**
     * Format date for display in server timezone
     * @param {string|Date|number} input - Date input
     * @param {string} format - Moment format string
     * @returns {string} Formatted date string
     */
    formatServerDate: (input, format = 'YYYY-MM-DD HH:mm:ss') => {
        const serverMoment = TimezoneService.toServerMoment(input);
        return serverMoment.format(format);
    },

    /**
     * Get timestamp for Firebase (server timezone)
     * @param {string|Date|number} input - Date input
     * @returns {Date} Date object for Firebase timestamp
     */
    getFirebaseTimestamp: (input) => {
        return TimezoneService.createServerDate(input);
    },

    /**
     * Convert Firebase timestamp to server timezone moment
     * @param {firebase.firestore.Timestamp|Date} timestamp - Firebase timestamp
     * @returns {moment} Moment object in server timezone
     */
    fromFirebaseTimestamp: (timestamp) => {
        if (!timestamp) return null;

        // Handle Firebase Timestamp
        if (timestamp.toDate) {
            // Get the UTC timestamp and convert to server timezone
            const utcTimestamp = timestamp.toMillis();
            return moment.tz(utcTimestamp, 'UTC').tz(serverTimezone);
        }

        // Handle regular Date
        return moment.tz(timestamp, serverTimezone);
    },

    /**
     * Process Firebase document data and convert all timestamps to server timezone
     * @param {Object} docData - Firebase document data
     * @returns {Object} Processed data with server timezone timestamps
     */
    processFirebaseData: (docData) => {
        const processed = { ...docData };

        // Convert timestamp fields to server timezone
        const timestampFields = [
            'createdAt', 'updatedAt', 'lastUpdated', 'timestamp',
            'recordedAt', 'date', 'startTime', 'endTime'
        ];

        timestampFields.forEach(field => {
            if (processed[field]) {
                if (processed[field].toDate) {
                    // Firebase Timestamp - convert to server timezone
                    const utcMillis = processed[field].toMillis();
                    processed[field] = moment.tz(utcMillis, 'UTC').tz(serverTimezone);
                } else if (processed[field] instanceof Date) {
                    // Regular Date - convert to server timezone
                    processed[field] = moment.tz(processed[field], serverTimezone);
                } else if (typeof processed[field] === 'string') {
                    // String date - parse and convert to server timezone
                    processed[field] = moment.tz(processed[field], serverTimezone);
                }
            }
        });

        return processed;
    },

    /**
     * Get time ago string in server timezone
     * @param {string|Date|number} input - Date input
     * @returns {string} Time ago string
     */
    getTimeAgo: (input) => {
        if (!input) return '';

        const serverMoment = TimezoneService.toServerMoment(input);
        const now = TimezoneService.getCurrentMoment();

        const diff = now.diff(serverMoment);
        const duration = moment.duration(diff);

        if (duration.asSeconds() < 60) return 'just now';
        if (duration.asMinutes() < 60) return `${Math.floor(duration.asMinutes())} minutes ago`;
        if (duration.asHours() < 24) return `${Math.floor(duration.asHours())} hours ago`;
        if (duration.asDays() < 7) return `${Math.floor(duration.asDays())} days ago`;
        if (duration.asWeeks() < 4) return `${Math.floor(duration.asWeeks())} weeks ago`;
        if (duration.asMonths() < 12) return `${Math.floor(duration.asMonths())} months ago`;

        return `${Math.floor(duration.asYears())} years ago`;
    },

    /**
     * Fetch the current time from an external API to ensure it's server-accurate.
     * @returns {Promise<moment>} A moment object with the accurate server time.
     */
    fetchServerTime: async () => {
        try {
            // Fetch time from our own serverless function proxy
            const response = await fetch('/api/time');
            if (!response.ok) {
                throw new Error(`Failed to fetch time: ${response.statusText}`);
            }
            const data = await response.json();
            // The 'dateTime' property from the API is an ISO 8601 string
            return moment.tz(data.dateTime, serverTimezone);
        } catch (error) {
            console.error('Error fetching server time, re-throwing error.', error);
            // Re-throw the error to be caught by the calling component
            throw error;
        }
    }
};

// Initialize moment to use server timezone globally
moment.tz.setDefault(serverTimezone);

export default TimezoneService;
