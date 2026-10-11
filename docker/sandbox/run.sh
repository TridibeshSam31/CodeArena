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

case "$language" in
    c)
        gcc -std=c11 -O2 -pipe "$source_file" -o /tmp/program
        exec timeout \
            --signal=TERM \
            --kill-after=1s \
            "${timeout_seconds}s" \
            /tmp/program
        ;;

    cpp)
        g++ -std=c++17 -O2 -pipe "$source_file" -o /tmp/program
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
            python3 "$source_file"
        ;;

    *)
        echo "Unsupported language: $language" >&2
        exit 64
        ;;
esac
