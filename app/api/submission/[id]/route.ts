import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/app/lib/prisma"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params   

    const submission = await prisma.submission.findUnique({
      where: { id }
    })

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: submission.id,
      language: submission.language,
      problemId: submission.problemId,
      status: submission.status,
      output: submission.output,
      stderr: submission.stderr,
      createdAt: submission.createdAt,
    })

  } catch (error) {
    console.error("Error fetching submission:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}