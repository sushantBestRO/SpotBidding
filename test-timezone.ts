// Test script to verify timezone conversion
import { formatDateTime, formatDateWithAMPM } from './src/utils/utils';

// Test with the exact timestamp from your database
const dbTimestamp = '2025-12-04T15:12:00.000Z'; // UTC time from database
const expectedIST = '04/12/2025 20:42'; // Expected IST output

console.log('Testing timezone conversion:');
console.log('Input (UTC):', dbTimestamp);
console.log('Expected (IST):', expectedIST);
console.log('Actual output:', formatDateTime(dbTimestamp));
console.log('');

// Test with current time
const now = new Date();
console.log('Current time test:');
console.log('UTC:', now.toISOString());
console.log('Formatted IST:', formatDateTime(now));
console.log('With AM/PM:', formatDateWithAMPM(now));
