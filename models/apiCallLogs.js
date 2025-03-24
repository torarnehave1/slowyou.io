
// Create a MongoDB schema to log incomming API calls to endpoints from users and groups.
// The schema should include the following fields based on the parameters of the API call and the headers:
// - `chatId` (string): the ID of the chat where the API call was made.
// - `userId` (string): the ID of the user who made the API call.
// - `endpoint` (string): the endpoint that was called.
// - `method` (string): the HTTP method used for the API call.
// - `params` (object): the parameters passed in the API call.
// - `headers` (object): the headers sent with the API call.
// - `timestamp` (Date): the timestamp of the API call.
// The schema should also include the following fields for metadata:
// - `createdAt` (Date): the timestamp when the log was created.
// - `updatedAt` (Date): the timestamp when the log was last updated.
// The schema should enforce the following validations:
// - `chatId`, `userId`, `endpoint`, and `method` are required fields.
// - `chatId` and `userId` should be strings.
// - `endpoint` and `method` should be strings with a maximum length of 255 characters.
// - `params` and `headers` should be objects.
// - `timestamp`, `createdAt`, and `updatedAt` should be Date objects.
// - `createdAt` and `updatedAt` should be auto-generated timestamps.
// Ensure the schema is flexible for future expansion (e.g., storing attachments).
// Add an index on `chatId` and `userId` for optimized queries.
// Use Mongoose for defining the schema and model.
//Use ES6 class syntax to define the model.
// The schema should be exported as the default module.

import mongoose from 'mongoose';

const { Schema } = mongoose;

const apiCallLogsSchema = new Schema(
  {
   
    emailVerificationToken: {
      type: String,
      required: true,
    },
    verified: {
      type: Boolean,
      required: true,
      default: false,
    },
    endpoint: {
      type: String,
      required: true,
      maxlength: 255,
    },
    email: {
      type: String,
      required: true,
      maxlength: 255,
    },
    params: {
      type: Object,
    },
    headers: {
      type: Object,
    },
    timestamp: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

apiCallLogsSchema.index({ chatId: 1, userId: 1 });

const ApiCallLogs = mongoose.model('ApiCallLogs', apiCallLogsSchema);

export default ApiCallLogs;
