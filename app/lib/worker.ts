//queue me jobs push krni hai 
//1.Fetch submission from db
//2.update status to running 
//3.Execute code 
//4.update db with result 

import {Worker} from "bullmq"
import { prisma } from "./prisma";
import executeCode from "./executor";

const worker = new Worker("submission-queue",async job=>{
    const {submissionId} = job.data

    //1.fetch submission from db 
    const submission = await prisma.submission.findUnique({
        where:{
            id:submissionId
        }
    })

    if (!submission) {
        console.error(`Submission not found for ID: ${submissionId}`);
        return;
    }

    //2.update status to running
    await prisma.submission.update({
        where:{
            id:submissionId
        },
        data:{
            status:"running"
        }
    })

    //3.execute code
    const result = await executeCode({
        code:submission.code,
        language:submission.language,
        input:submission.stdin?? ""
    })

    //4.update db with result
    await prisma.submission.update({
        where:{
            id:submissionId
        },
        data:{
            status:result.success?"completed":"error",
            output:result.stdout||"",
            stderr:result.stderr||""
        }

    })
},
{
    connection: {
      url: process.env.REDIS_URL!,
      maxRetriesPerRequest: null,
    },
}
)

worker.on("failed", async (job, err) => {
  console.error(` Job ${job?.id} failed:`, err.message);
 
  // Mark submission as error in DB if worker itself crashes
  if (job?.data?.submissionId) {
    await prisma.submission.update({
      where: { id: job.data.submissionId },
      data: {
        status: "error",
        stderr: err.message,
      },
    }).catch(() => {}); // silently ignore if DB also fails
  }
});
 
console.log(" Worker started — listening for jobs...");