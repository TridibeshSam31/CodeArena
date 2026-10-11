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


import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

interface ExecuteCodeParams {
    code: string;
    language: string;
    input: string;
}

interface ExecutionResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    executionTimeMs: number;
    startedAt: Date;
    completedAt: Date;
    verdict: string | null;
    error?: string;
}

const DOCKER_IMAGE = "codearena-sandbox:local";

// Outer deadline covers container startup, compilation and execution.
const EXECUTION_TIMEOUT_MS = 5000;
const FORCE_KILL_DELAY_MS = 1000;
const CLEANUP_TIMEOUT_MS = 1500;
const MAX_OUTPUT_BYTES = 1024 * 1024;

const SUPPORTED_LANGUAGES: Record<
    string,
    { runnerLanguage: string; extension: string }
> = {
    c: {
        runnerLanguage: "c",
        extension: "c",
    },
    cpp: {
        runnerLanguage: "cpp",
        extension: "cpp",
    },
    python: {
        runnerLanguage: "python",
        extension: "py",
    },
};

function createResult(
    startedAt: Date,
    values: Partial<ExecutionResult> = {},
): ExecutionResult {
    const completedAt = new Date();

    return {
        success: false,
        stdout: "",
        stderr: "",
        exitCode: null,
        verdict: null,
        ...values,
        startedAt,
        completedAt,
        executionTimeMs: Math.max(
            0,
            completedAt.getTime() - startedAt.getTime(),
        ),
    };
}

function runDockerCleanup(args: string[]): Promise<void> {
    return new Promise((resolve) => {
        let settled = false;

        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        };

        let child: ChildProcess;

        try {
            child = spawn("docker", args, {
                shell: false,
                stdio: "ignore",
                windowsHide: true,
            });
        } catch {
            finish();
            return;
        }

        const timer = setTimeout(() => {
            child.kill();
            finish();
        }, CLEANUP_TIMEOUT_MS);

        child.once("error", finish);
        child.once("close", finish);
    });
}

async function cleanupContainer(containerName: string): Promise<void> {
    // The container might already have exited or been removed.
    await runDockerCleanup(["kill", containerName]);
    await runDockerCleanup(["rm", "-f", containerName]);
}

function executeInDocker(
    language: string,
    sourcePath: string,
    tempDir: string,
    input: string,
    startedAt: Date,
): Promise<ExecutionResult> {
    return new Promise((resolve) => {
        const containerName = `codearena-${randomUUID()}`;

        // Docker Desktop accepts forward-slash paths on Windows.
        const mountSource = path.resolve(tempDir).replace(/\\/g, "/");

        const args = [
            "run",
            "--rm",
            "--name",
            containerName,
            "--pull=never",
            "--interactive",
            "--network=none",
            "--memory=128m",
            "--memory-swap=128m",
            "--cpus=0.5",
            "--pids-limit=64",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
            "--read-only",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=64m",
            "--user=10001:10001",
            "--mount",
            `type=bind,source=${mountSource},target=/workspace,readonly`,
            DOCKER_IMAGE,
            language,
            sourcePath,
        ];

        let child: ChildProcess;

        try {
            child = spawn("docker", args, {
                shell: false,
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"],
            });
        } catch (error) {
            resolve(
                createResult(startedAt, {
                    verdict: "Execution Error",
                    error:
                        error instanceof Error
                            ? error.message
                            : "Could not start Docker",
                    stderr: "Failed to start Docker process.",
                }),
            );
            return;
        }

        let stdout = "";
        let stderr = "";
        let outputBytes = 0;

        let timedOut = false;
        let outputLimitExceeded = false;
        let spawnError: Error | null = null;
        let finished = false;
        let cleanupPromise: Promise<void> | null = null;

        let timeoutTimer: ReturnType<typeof setTimeout>;
        let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

        const terminateContainer = () => {
            if (!cleanupPromise) {
                cleanupPromise = cleanupContainer(containerName);
            }

            if (child.pid !== undefined) {
                child.kill("SIGTERM");

                forceKillTimer = setTimeout(() => {
                    child.kill("SIGKILL");
                }, FORCE_KILL_DELAY_MS);
            }
        };

        const appendOutput = (
            stream: "stdout" | "stderr",
            chunk: Buffer,
        ) => {
            if (finished) return;

            const remaining = MAX_OUTPUT_BYTES - outputBytes;
            const accepted = chunk.subarray(
                0,
                Math.max(0, remaining),
            );

            if (stream === "stdout") {
                stdout += accepted.toString("utf8");
            } else {
                stderr += accepted.toString("utf8");
            }

            outputBytes += accepted.length;

            if (accepted.length < chunk.length) {
                outputLimitExceeded = true;
                terminateContainer();
            }
        };

        const finish = async (exitCode: number | null) => {
            if (finished) return;
            finished = true;

            clearTimeout(timeoutTimer);

            if (forceKillTimer) {
                clearTimeout(forceKillTimer);
            }

            if (timedOut || outputLimitExceeded) {
                await cleanupPromise;
            }

            if (spawnError) {
                resolve(
                    createResult(startedAt, {
                        stdout,
                        stderr:
                            stderr ||
                            `Docker process failed: ${spawnError.message}`,
                        verdict: "Execution Error",
                        error: spawnError.message,
                    }),
                );
                return;
            }

            if (timedOut) {
                resolve(
                    createResult(startedAt, {
                        stdout,
                        stderr: `${stderr}${
                            stderr ? "\n" : ""
                        }Time Limit Exceeded`,
                        exitCode,
                        verdict: "Time Limit Exceeded",
                        error: "Execution exceeded the time limit.",
                    }),
                );
                return;
            }

            if (outputLimitExceeded) {
                resolve(
                    createResult(startedAt, {
                        stdout,
                        stderr: `${stderr}${
                            stderr ? "\n" : ""
                        }Output limit exceeded.`,
                        exitCode,
                        verdict: "Output Limit Exceeded",
                        error: "Combined output exceeded 1 MiB.",
                    }),
                );
                return;
            }

            // Docker reserves exit code 125 for docker run errors.
            // Do not confuse infrastructure errors with user-code errors.
            if (exitCode === 125) {
                resolve(
                    createResult(startedAt, {
                        stdout,
                        stderr,
                        exitCode,
                        verdict: "Execution Error",
                        error:
                            stderr ||
                            "Docker could not start the sandbox container.",
                    }),
                );
                return;
            }

            if (exitCode === 0) {
                resolve(
                    createResult(startedAt, {
                        success: true,
                        stdout,
                        stderr,
                        exitCode: 0,
                        verdict: null,
                    }),
                );
                return;
            }

            // The current run.sh does not distinguish compiler failures
            // from non-zero exits by the submitted program.
            // Leave verdict null rather than inventing a classification.
            resolve(
                createResult(startedAt, {
                    success: false,
                    stdout,
                    stderr,
                    exitCode,
                    verdict: null,
                    error:
                        exitCode === null
                            ? "Docker process ended without an exit code."
                            : `Process exited with code ${exitCode}.`,
                }),
            );
        };

        timeoutTimer = setTimeout(() => {
            timedOut = true;
            terminateContainer();
        }, EXECUTION_TIMEOUT_MS);

        child.stdout?.on("data", (chunk: Buffer) => {
            appendOutput("stdout", chunk);
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            appendOutput("stderr", chunk);
        });

        child.stdin?.on("error", () => {
            // EPIPE can occur when the submitted program exits
            // before consuming all of its stdin.
        });

        child.once("error", (error) => {
            spawnError = error;
        });

        child.once("close", (exitCode) => {
            void finish(exitCode);
        });

        // The runner executes the submitted program with its own stdin.
        // No input file or shell redirection is needed on the host.
        child.stdin?.end(input);
    });
}

export default async function executeCode({
    code,
    language,
    input,
}: ExecuteCodeParams): Promise<ExecutionResult> {
    const startedAt = new Date();

    const normalizedLanguage = language.trim().toLowerCase();
    const languageConfig = SUPPORTED_LANGUAGES[normalizedLanguage];

    if (!languageConfig) {
        return createResult(startedAt, {
            verdict: "Unsupported Language",
            error: `Unsupported language: ${language}`,
            stderr: `Unsupported language: ${language}`,
        });
    }

    let tempDir: string | undefined;

    try {
        tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "codearena-"),
        );

        const fileName = `code.${languageConfig.extension}`;
        const sourcePath = `/workspace/${fileName}`;
        const hostSourcePath = path.join(tempDir, fileName);

        fs.writeFileSync(hostSourcePath, code, {
            encoding: "utf8",
            mode: 0o444,
        });

        return await executeInDocker(
            languageConfig.runnerLanguage,
            sourcePath,
            tempDir,
            input,
            startedAt,
        );
    } catch (error) {
        return createResult(startedAt, {
            verdict: "Execution Error",
            error:
                error instanceof Error
                    ? error.message
                    : "Unknown executor error",
            stderr: "Failed to prepare or execute the sandbox.",
        });
    } finally {
        if (tempDir) {
            fs.rmSync(tempDir, {
                recursive: true,
                force: true,
            });
        }
    }
}
