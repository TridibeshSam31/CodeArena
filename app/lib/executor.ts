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
import { logger, type StructuredLogger } from "./logger";

interface ExecuteCodeParams {
    code: string;
    language: string;
    input: string;
    submissionId?: string;
    jobId?: string;
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
const EXECUTION_TIMEOUT_MS = 15000;
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

async function cleanupContainer(
    containerName: string,
    execLogger?: StructuredLogger
): Promise<void> {
    execLogger?.debug("Cleaning up Docker container", { containerName });
    // The container might already have exited or been removed.
    await runDockerCleanup(["kill", containerName]);
    await runDockerCleanup(["rm", "-f", containerName]);
}

/**
 * Sweeps orphaned Docker containers left behind by abrupt process exits or crashes.
 * Strictly filters by label `com.codearena.managed=true` to never touch unrelated containers.
 */
export async function sweepOrphanContainers(): Promise<number> {
    return new Promise((resolve) => {
        let child: ChildProcess;
        try {
            child = spawn(
                "docker",
                ["ps", "-aq", "--filter", "label=com.codearena.managed=true"],
                {
                    shell: false,
                    windowsHide: true,
                    stdio: ["ignore", "pipe", "ignore"],
                }
            );
        } catch (error) {
            logger.warn("Failed to invoke docker ps for orphan container sweeping", error);
            resolve(0);
            return;
        }

        let output = "";
        child.stdout?.on("data", (chunk: Buffer) => {
            output += chunk.toString("utf8");
        });

        const timer = setTimeout(() => {
            child.kill();
            resolve(0);
        }, CLEANUP_TIMEOUT_MS * 2);

        child.once("close", async () => {
            clearTimeout(timer);
            const containerIds = output
                .split(/\r?\n/)
                .map((id) => id.trim())
                .filter((id) => id.length > 0);

            if (containerIds.length === 0) {
                resolve(0);
                return;
            }

            logger.info(`Sweeping ${containerIds.length} managed orphan container(s)`, {
                count: containerIds.length,
            });

            // Remove only containers with our specific label
            for (const id of containerIds) {
                await runDockerCleanup(["rm", "-f", id]);
            }

            resolve(containerIds.length);
        });

        child.once("error", () => {
            clearTimeout(timer);
            resolve(0);
        });
    });
}

function executeInDocker(
    language: string,
    sourcePath: string,
    tempDir: string,
    input: string,
    startedAt: Date,
    submissionId?: string,
    jobId?: string,
): Promise<ExecutionResult> {
    const execLogger = logger.child({
        service: "executor",
        submissionId,
        jobId,
    });

    return new Promise((resolve) => {
        const containerName = `codearena-${randomUUID()}`;

        // Docker Desktop accepts forward-slash paths on Windows.
        const mountSource = path.resolve(tempDir).replace(/\\/g, "/");

        const args = [
            "run",
            "--rm",
            "--name",
            containerName,
            "--label",
            "com.codearena.managed=true",
            "--pull=never",
            "--interactive",
            "--network=none",
            "--memory=512m",
            "--memory-swap=512m",
            "--cpus=1",
            "--pids-limit=64",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
            "--read-only",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,exec,size=64m",
            "--user=10001:10001",
            "--mount",
            `type=bind,source=${mountSource},target=/workspace,readonly`,
            "-e",
            "SANDBOX_TIMEOUT_SECONDS=3",
            "-e",
            "SANDBOX_COMPILE_TIMEOUT_SECONDS=10",
            DOCKER_IMAGE,
            language,
            sourcePath,
        ];

        execLogger.info("Spawning sandbox Docker container", {
            containerName,
            language,
        });

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
                cleanupPromise = cleanupContainer(containerName, execLogger);
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
                        stderr,
                        exitCode: null,
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
                        stderr,
                        exitCode: null,
                        verdict: "Output Limit Exceeded",
                        error: "Combined output exceeded 1 MiB.",
                    }),
                );
                return;
            }

            // GNU timeout returns exit code 124 when the program exceeds
            // the execution limit inside the sandbox.
            if (exitCode === 124) {
                resolve(
                    createResult(startedAt, {
                        success: false,
                        stdout,
                        stderr,
                        exitCode: 124,
                        verdict: "Time Limit Exceeded",
                        error: "Execution exceeded the time limit.",
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

            // Exit code 126 (cannot invoke) or 127 (not found)
            if (exitCode === 126 || exitCode === 127) {
                resolve(
                    createResult(startedAt, {
                        stdout,
                        stderr,
                        exitCode,
                        verdict: "Execution Error",
                        error:
                            stderr ||
                            `Sandbox runner command failed with exit code ${exitCode}.`,
                    }),
                );
                return;
            }

            // Compilation error handling
            let cleanStderr = stderr;
            let isCompilationError = false;
            if (cleanStderr.includes("[COMPILATION_ERROR]")) {
                isCompilationError = true;
                cleanStderr = cleanStderr.replace(/\[COMPILATION_ERROR\]\r?\n?/g, "").trimEnd();
            } else if (exitCode === 65) {
                isCompilationError = true;
            } else if (
                (language === "c" || language === "cpp") &&
                exitCode === 1 &&
                !stdout &&
                (cleanStderr.includes(": error:") || cleanStderr.includes("fatal error:"))
            ) {
                isCompilationError = true;
            }

            if (isCompilationError) {
                resolve(
                    createResult(startedAt, {
                        success: false,
                        stdout,
                        stderr: cleanStderr,
                        exitCode: 1,
                        verdict: "Compilation Error",
                        error: "Compilation failed.",
                    }),
                );
                return;
            }

            if (exitCode === 0) {
                resolve(
                    createResult(startedAt, {
                        success: true,
                        stdout,
                        stderr: cleanStderr,
                        exitCode: 0,
                        verdict: "Accepted",
                    }),
                );
                return;
            }

            // Any other non-zero exit code indicates a Runtime Error
            resolve(
                createResult(startedAt, {
                    success: false,
                    stdout,
                    stderr: cleanStderr,
                    exitCode,
                    verdict: "Runtime Error",
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
            void finish(null);
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
    submissionId,
    jobId,
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
            submissionId,
            jobId,
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
            try {
                fs.rmSync(tempDir, {
                    recursive: true,
                    force: true,
                });
            } catch {
                // On Windows, background handles may be held briefly; retry after brief delay
                const dirToClean = tempDir;
                setTimeout(() => {
                    try {
                        if (fs.existsSync(dirToClean)) {
                            fs.rmSync(dirToClean, { recursive: true, force: true });
                        }
                    } catch {
                        // ignore background cleanup error
                    }
                }, 300);
            }
        }
    }
}
