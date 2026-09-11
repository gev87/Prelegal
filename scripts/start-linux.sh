#!/usr/bin/env bash
# Build and start Prelegal. The database inside is created from scratch on
# every start — do not add a volume for it, or that stops being true.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

start_prelegal "Start it with: sudo systemctl start docker"
