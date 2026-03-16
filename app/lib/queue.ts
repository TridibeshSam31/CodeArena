import { Queue } from "bullmq";

export const submissionQueue = new Queue("submission-queue", {
  connection: {
    url: process.env.REDIS_URL!,
    maxRetriesPerRequest: null, // Disable retries for better error handling
  },
});



/*

we cant write the below code 
import { Queue } from "bullmq";
import IORedis from "ioredis";
export const connection = new IORedis(process.env.REDIS_URL!, {
2
maxRetriesPerRequest: null,
});
export const submissionQueue = new Queue("submission-queue", { connection });

this is because of the way bullmq handles connections. It creates a new connection for each queue, and if we share the same connection instance, it can lead to unexpected behavior and errors. By creating a new connection for each queue, we ensure that each queue operates independently and avoids potential conflicts.







*/
