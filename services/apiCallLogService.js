import ApiCallLogs from '../models/apiCallLogs.js';

export const logApiCall = async (data) => {
  try {
    const logEntry = new ApiCallLogs(data);
    await logEntry.save();
  } catch (error) {
    console.error('Failed to log API call:', error);
  }
};
