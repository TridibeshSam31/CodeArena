#!/bin/sh


set -eu

# Usage: run-submission <language> <source-file>

if [ "$#" -ne 2 ]; then
    echo "Usage: run-submission <language> <source-file>" >&2
    exit 64
fi

language="$1"
source_file="$2"

if [ ! -f "$source_file" ]; then
    echo "Source file not found" >&2
    exit 66
fi

# A basic execution timeout for local sandbox tests.
timeout_seconds="${SANDBOX_TIMEOUT_SECONDS:-3}"
compile_timeout="${SANDBOX_COMPILE_TIMEOUT_SECONDS:-10}"

case "$language" in
    c)
        if ! timeout --signal=TERM --kill-after=1s "${compile_timeout}s" gcc -std=c11 -O2 -pipe "$source_file" -o /tmp/program; then
            echo "[COMPILATION_ERROR]" >&2
            exit 65
        fi
        exec timeout \
            --signal=TERM \
            --kill-after=1s \
            "${timeout_seconds}s" \
            /tmp/program
        ;;

    cpp)
        if ! timeout --signal=TERM --kill-after=1s "${compile_timeout}s" g++ -std=c++17 -O2 -pipe "$source_file" -o /tmp/program; then
            echo "[COMPILATION_ERROR]" >&2
            exit 65
        fi
        exec timeout \
            --signal=TERM \
            --kill-after=1s \
            "${timeout_seconds}s" \
            /tmp/program
        ;;

    python)
        exec timeout \
            --signal=TERM \
            --kill-after=1s \
            "${timeout_seconds}s" \
            python3 -u "$source_file"
        ;;

    *)
        echo "Unsupported language: $language" >&2
        exit 64
        ;;
esac
