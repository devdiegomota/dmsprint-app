#!/usr/bin/env python3
"""Probe v2: double-fork correto (pai e filho intermediário saem; só o neto fica).

Escreve tick a cada 2s. Objetivo: distinguir se o sandbox congela ou mata
processos entre chamadas de ferramenta.
- Se o log crescer DURANTE a chamada 2 (sem novo spawn) → congelamento/pausa.
- Se o log ficar parado e o neto não existir mais → morte (reaper).
"""
import os
import sys
import time

LOG = "/home/z/my-project/scripts/probe2.log"


def run():
    os.chdir("/home/z/my-project")
    devnull = os.open(os.devnull, os.O_RDWR)
    os.dup2(devnull, 0)
    os.dup2(devnull, 1)
    os.dup2(devnull, 2)
    with open(LOG, "a") as f:
        f.write(f"START pid={os.getpid()} t={time.time():.1f}\n")
        f.flush()
        while True:
            time.sleep(2)
            f.write(f"tick {time.time():.1f}\n")
            f.flush()


def main():
    pid1 = os.fork()
    if pid1 == 0:  # filho
        os.setsid()
        pid2 = os.fork()
        if pid2 == 0:  # neto
            run()
        sys.exit(0)  # filho intermediário sai
    os.waitpid(pid1, 0)  # pai espera o filho e sai
    sys.exit(0)


if __name__ == "__main__":
    main()
