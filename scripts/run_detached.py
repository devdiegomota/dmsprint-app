#!/usr/bin/env python3
"""Executa um comando destacado (double-fork + setsid) que sobrevive ao ciclo de tool calls.

Uso: python3 run_detached.py <logfile> <stdin_path|-> <comando...>

- logfile: stdout+stderr do comando (append)
- stdin_path: caminho para usar como stdin (ex.: FIFO para enviar input depois);
  use "-" para /dev/null
Padrão comprovado no sandbox: fork → setsid → fork (pai e filho do meio saem,
o neto vira filho do init e sobrevive).
"""
import os
import sys


def main() -> None:
    log_path = sys.argv[1]
    stdin_path = sys.argv[2]
    cmd = sys.argv[3:]
    if not cmd:
        raise SystemExit("uso: run_detached.py <logfile> <stdin|-> <cmd...>")

    pid1 = os.fork()
    if pid1 == 0:
        os.setsid()
        pid2 = os.fork()
        if pid2 == 0:
            flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND
            log = os.open(log_path, flags, 0o644)
            os.dup2(log, 1)
            os.dup2(log, 2)
            if stdin_path == "-":
                stdin_fd = os.open(os.devnull, os.O_RDONLY)
            else:
                # O_RDWR: abrir FIFO para leitura puro bloquearia até haver escritor.
                stdin_fd = os.open(stdin_path, os.O_RDWR)
            os.dup2(stdin_fd, 0)
            os.execvp(cmd[0], cmd)
        os._exit(0)
    os.waitpid(pid1, 0)


if __name__ == "__main__":
    main()
