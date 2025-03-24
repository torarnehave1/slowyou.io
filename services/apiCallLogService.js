import ApiCallLogs from '../models/apiCallLogs.js';

export const logApiCall = async (data) => {
  try {
    console.log('Logging API call with data:', data);
    const logEntry = new ApiCallLogs(data);
    await logEntry.save();
    console.log('API call logged successfully');
  } catch (error) {
    console.error('Failed to log API call:', error);
  }
};
