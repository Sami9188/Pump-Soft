// Test script to verify timezone functionality
import TimezoneService from './services/timezoneService.js';

console.log('=== TIMEZONE SERVICE TEST ===');

// Test 1: Get server timezone
console.log('1. Server Timezone:', TimezoneService.getServerTimezone());

// Test 2: Create server date
const serverDate = TimezoneService.createServerDate();
console.log('2. Server Date:', serverDate);

// Test 3: Format server date
const formattedDate = TimezoneService.formatServerDate(null, 'YYYY-MM-DD HH:mm:ss');
console.log('3. Formatted Server Date:', formattedDate);

// Test 4: Get current moment
const currentMoment = TimezoneService.getCurrentMoment();
console.log('4. Current Server Moment:', currentMoment.format());

// Test 5: Convert existing date to server timezone
const testDate = new Date('2024-01-15T10:30:00');
const serverMoment = TimezoneService.toServerMoment(testDate);
console.log('5. Converted Date to Server Timezone:', serverMoment.format());

// Test 6: Firebase timestamp simulation with UTC timestamp
const firebaseTimestamp = {
    toDate: () => new Date(),
    toMillis: () => Date.now()  // UTC milliseconds
};
const fromFirebase = TimezoneService.fromFirebaseTimestamp(firebaseTimestamp);
console.log('6. From Firebase Timestamp (UTC):', fromFirebase.format());
console.log('6. UTC Millis:', firebaseTimestamp.toMillis());
console.log('6. Server Timezone Format:', fromFirebase.format('YYYY-MM-DD HH:mm:ss'));

// Test 7: Process Firebase data simulation
const firebaseDocData = {
    createdAt: firebaseTimestamp,
    updatedAt: firebaseTimestamp,
    recordedAt: firebaseTimestamp,
    someOtherField: 'test'
};
const processedData = TimezoneService.processFirebaseData(firebaseDocData);
console.log('7. Processed Firebase Data:');
console.log('   createdAt:', processedData.createdAt.format('YYYY-MM-DD HH:mm:ss'));
console.log('   updatedAt:', processedData.updatedAt.format('YYYY-MM-DD HH:mm:ss'));
console.log('   recordedAt:', processedData.recordedAt.format('YYYY-MM-DD HH:mm:ss'));

// Test 8: Get time ago
const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
const timeAgo = TimezoneService.getTimeAgo(pastDate);
console.log('8. Time Ago:', timeAgo);

// Test 9: Verify client vs server time difference
const clientTime = new Date().toLocaleString();
const serverTime = TimezoneService.formatServerDate(null, 'YYYY-MM-DD HH:mm:ss');
console.log('9. Client Time (local):', clientTime);
console.log('9. Server Time (Asia/Karachi):', serverTime);

// Test 10: Dashboard Layout Time Display
import React from 'react';
console.log('10. Dashboard Layout Time Test:');
console.log('   Server Timezone:', TimezoneService.getServerTimezone());
console.log('   Current Server Time:', TimezoneService.formatServerDate(null, 'dddd, MMMM DD, YYYY - hh:mm A'));
console.log('   Server Year for Footer:', TimezoneService.formatServerDate(null, 'YYYY'));

// Test 11: Firebase Data Processing
console.log('11. Firebase Data Processing Test:');
const mockFirebaseData = {
    createdAt: { toDate: () => new Date(), toMillis: () => Date.now() },
    date: new Date('2024-01-15'),
    amount: 1000
};
const processedData = TimezoneService.processFirebaseData(mockFirebaseData);
console.log('   Original Date:', mockFirebaseData.date.toISOString());
console.log('   Processed Date:', processedData.date.format('YYYY-MM-DD HH:mm:ss'));

console.log('=== ALL TESTS COMPLETED ===');
console.log('✅ TIMEZONE FIX VERIFICATION:');
console.log('   - Dashboard header should show SERVER time (Asia/Karachi)');
console.log('   - Footer copyright should show SERVER year');
console.log('   - All dates in tables should be in SERVER timezone');
console.log('   - Regardless of your device\'s timezone settings!');
