//execute the code in a sandboxed environment 
//but we will use child_process to execute the code in a separate process 
//Write code → temp file → g++ compile → run with stdin → capture stdout/stderr


//what we have to do in this ???
//1.user code+language+input deta hai 
//2.System ek temporary folder bnata hai
//3.Code ko file me likhta hai 
//4.Compile karta hai (agar c++ hai to g++ se)
//5.Program run krega with input 
//6.output dega
//7.Error/timeout handle krega
//8.return the result
//9.Delete the temporary files

import { execSync, ExecSyncOptionsWithBufferEncoding } from "child_process";
import fs from "fs"
import path from "path"
import os from "os"

const GPP = `C:\\msys64\\mingw64\\bin\\g++.exe`;
const GCC = `C:\\msys64\\mingw64\\bin\\gcc.exe`;


const codeExecutionTimeout = 5000; //5 seconds

interface ExecuteCodeParams {
    code: string,
    language: string,
    input: string
}

const execOptions: ExecSyncOptionsWithBufferEncoding = {
    timeout: codeExecutionTimeout,
    stdio: "pipe",
    //@ts-ignore
    shell: true,
    env: {
        ...process.env,
        PATH: `C:\\msys64\\mingw64\\bin;${process.env.PATH}`,
    } as NodeJS.ProcessEnv,
};


export default function executeCode({ code, language, input }: ExecuteCodeParams) {
    const baseTemp = "C:/codearena-temp";
    if (!fs.existsSync(baseTemp)) fs.mkdirSync(baseTemp, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(baseTemp, "run-")).replace(/\\/g, "/");

    try {
        switch (language) {
            case "cpp":
                return executeCpp(code, input, tempDir)
            case "c":
                return executeC(code, input, tempDir)
            case "python":
                return executePython(code, input, tempDir)
            default:
                return {
                    success: false,
                    error: "Unsupported language",
                    stdout: "",
                    stderr: `unsupported language ${language}`,
                    verdict: "error"

                }
        }

    } finally {
        //cleanup temp directory
        fs.rmSync(tempDir, { recursive: true, force: true })

    }
}



//c++ code execution

function executeCpp(code: string, input: string, tempDir: string) {
    const inputFile = path.join(tempDir, "input.txt") //create input file
    const sourceFile = path.join(tempDir, "code.cpp") //create source file
    const outputFile = path.join(tempDir, "main.exe") //output executable file

    fs.writeFileSync(inputFile, input) //writeFileSync method take the file name input in which we have to write and the data which has to be wruitten
    fs.writeFileSync(sourceFile, code)

    //compile the code 
    //g++ code.cpp -o main.exe
    try {
        execSync(`"${GPP}" "${sourceFile}" -o "${outputFile}"`, execOptions)

    } catch (error: any) {
        console.log("Compilation error:", error)
        return {
            success: false,
            error: "Compilation failed",
            stdout: "",
            stderr: error.message,
            verdict: "compilation error"
        }
    }



    //Execute the code
    try {
        const stdout = execSync(`"${outputFile}"`, {
            ...execOptions,
            input: input,
            stdio: ["pipe", "pipe", "pipe"],
        })
        return {
            success: true,
            stdout: stdout.toString(),
            stderr: "",
            verdict: null, // To be determined by evaluator
        }
    } catch (error: any) {
        console.log("Execution error:", error)
        // Check if it's a timeout
        if (error.killed) {
            return {
                success: false,
                stdout: "",
                stderr: "Time Limit Exceeded",
                verdict: "Runtime Error",
            };
        }
        return {
            success: false,
            stdout: error.stdout ? error.stdout.toString() : "",
            stderr: error.stderr?.toString() || error.stdout?.toString() || error.message,
            verdict: "Runtime Error",
        };

    }
}


//c Execution 
function executeC(code: string, input: string, tempDir: string) {
    const inputFile = path.join(tempDir, "input.txt")
    const sourceFile = path.join(tempDir, "code.c")
    const outputFile = path.join(tempDir, "main.exe")

    fs.writeFileSync(inputFile, input)
    fs.writeFileSync(sourceFile, code)

    //compile the code

    try {
        execSync(`"${GCC}" "${sourceFile}" -o "${outputFile}"`, execOptions)

    } catch (error) {
        console.log("Compilation error:", error)
        return {
            success: false,
            error: "Compilation failed",
            stdout: "",
            stderr: "",
            verdict: "compilation error"
        }


    }

    //Execute 
    try {
        const stdout = execSync(`"${outputFile}" < "${inputFile}"`, {
            ...execOptions,
            stdio: ["pipe", "pipe", "pipe"],
        })
        return {
            success: true,
            stdout: stdout.toString(),
            stderr: "",
            verdict: null
        }

    } catch (error: any) {
        if (error.killed) {
            return {
                success: false,
                stdout: "",
                stderr: "Time Limit Exceeded",
                verdict: "Runtime Error",
            };
        }
        return {
            success: false,
            stdout: error.stdout ? error.stdout.toString() : "",
            stderr: error.stderr ? error.stderr.toString() : "Runtime error",
            verdict: "Runtime Error",
        };

    }

}

//python execution
function executePython(code: string, input: string, tempDir: string) {
    const inputFile = path.join(tempDir, "input.txt")
    const sourceFile = path.join(tempDir, "code.py")

    fs.writeFileSync(inputFile, input)
    fs.writeFileSync(sourceFile, code)

    try {
        const stdout = execSync(`python3 "${sourceFile}" < "${inputFile}"`, {
            ...execOptions,
            stdio: ["pipe", "pipe", "pipe"],
        })
        return {
            success: true,
            stdout: stdout.toString(),
            stderr: "",
            verdict: null
        }

    } catch (error: any) {
        if (error.killed) {
            return {
                success: false,
                stdout: "",
                stderr: "Time Limit Exceeded",
                verdict: "Runtime Error",
            }

        }

        const stderr = error.stderr ? error.stderr.toString() : "";
        // Python syntax errors are "Compilation Errors" in contest context
        if (stderr.includes("SyntaxError")) {
            return {
                success: false,
                stdout: "",
                stderr,
                verdict: "Compilation Error",
            };
        }

        return {
            success: false,
            stdout: error.stdout ? error.stdout.toString() : "",
            stderr,
            verdict: "Runtime Error",
        };

    }

}