import { Queue } from "bullmq";

export const submissionQueue = new Queue("submission-queue", {
  connection: {
    url: process.env.REDIS_URL!,
    maxRetriesPerRequest: null, // Disable retries for better error handling
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1500, //i.e 1.5 sec ,  3 sec , 6 sec then stop 
    },
    removeOnComplete: {
      age: 3600,  // keep for 1 hour 
      count: 1000,  //max 1000 jobs 
    },
    removeOnFail: {
      age: 86400 * 3, // keep for 3 days 
      count: 5000,  // max 5000 jobs 
    },
  }
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
