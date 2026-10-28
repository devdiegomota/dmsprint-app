#!/usr/bin/env python3
"""Sobe o dev server do ImpressA4 como daemon desanexado (double-fork + setsid).

Padrão validado pelo probe2: o processo neto (reparentado ao init) sobrevive
entre as chamadas de ferramenta. O pai espera o filho e sai limpo, devolvendo
o controle ao shell imediatamente.

Uso: python3 /home/z/my-project/scripts/dev_server_daemon.py
"""
import os
import sys

PROJECT = "/home/z/my-project"
LOG = f"{PROJECT}/dev-server.log"


def run_server():
    os.chdir(PROJECT)
    devnull = os.open(os.devnull, os.O_RDWR)
    os.dup2(devnull, 0)
    # stdout/stderr → log (o npm run dev já faz tee dev.log; aqui guardamos o ciclo de vida)
    fd = os.open(LOG, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
    os.dup2(fd, 1)
    os.dup2(fd, 2)
    # substitui o processo pelo dev server (pipeline via bash para preservar o tee)
    os.execvp("bash", ["bash", "-c", f"cd {PROJECT} && exec bun run dev"])


def main():
    pid1 = os.fork()
    if pid1 == 0:  # filho
        os.setsid()
        pid2 = os.fork()
        if pid2 == 0:  # neto — reparentado ao init, sobrevive
            run_server()
        sys.exit(0)
    os.waitpid(pid1, 0)
    sys.exit(0)


if __name__ == "__main__":
    main()
