import { NextResponse,NextRequest } from "next/server";
import {prisma} from "@/app/lib/prisma"
import { submissionQueue } from "@/app/lib/queue";

export async function POST(request:NextRequest){
    const {code,language,stdin,problemId} = await request.json()

    //valiate inputs 
    if (!code||!language||!stdin) {
        return NextResponse.json({error:"Missing required fields"}, {status:400})
        
    }
    

    //validate language
    const supportedLanguages = ["cpp","python","java"]
    if(!supportedLanguages.includes(language)){
        return NextResponse.json({error:"Unsupported language"}, {status:400})

    }

    //create submission entry in database
    const submission = await prisma.submission.create({
        data:{
            code,
            language,
            stdin,
            status:"pending",
            problemId: problemId ? Number(problemId) : null,

        }
    })

    //  Push job to queue
    await submissionQueue.add("execute", {
      submissionId: submission.id,
    });

    //return response with submission id
    return NextResponse.json({
        submissionId: submission.id,

    })


}