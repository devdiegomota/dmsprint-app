#!/usr/bin/env python3
"""Daemon de teste: double-fork completo (sesid + fork 2x) escrevendo heartbeat.

Objetivo: descobrir se o sandbox mata processos por cgroup (nada escapa)
ou por rastreamento de árvore de processos (double-fork escapa).
"""
import os
import sys
import time

LOG = "/home/z/my-project/scripts/daemon-heartbeat.log"


def grandchild():
    os.chdir("/home/z/my-project")
    devnull = os.open(os.devnull, os.O_RDWR)
    os.dup2(devnull, 0)
    os.dup2(devnull, 1)
    os.dup2(devnull, 2)
    with open(LOG, "a") as f:
        f.write(f"START pid={os.getpid()} ppid={os.getppid()} t={time.time()}\n")
        f.flush()
        while True:
            time.sleep(2)
            f.write(f"tick {time.time()}\n")
            f.flush()


def main():
    os.fork()
    os.setsid()  # primeira separação de sessão
    os.fork()    # segunda separação (avô morre, neto fica órfão reparentado ao init)
    # apenas o neto chega aqui
    grandchild()


if __name__ == "__main__":
    main()
