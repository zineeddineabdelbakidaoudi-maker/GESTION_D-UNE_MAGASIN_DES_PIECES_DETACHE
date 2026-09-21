# -*- coding: utf-8 -*-
"""Génère l'ensemble des manuels PDF livrés au client.

Usage :  python docs/build_all.py
"""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

print("Génération des manuels PDF :")
for script in ("guide_installation.py", "guide_tests.py"):
    runpy.run_path(os.path.join(HERE, script), run_name="__main__")
print("Terminé.")
