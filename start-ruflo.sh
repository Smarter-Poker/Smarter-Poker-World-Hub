#!/bin/bash
set -a
source .agent/skills/credentials/.env
set +a
npx ruflo@latest swarm start -s analysis -o "Audit training module (src/components/training, pages/api/training, src/config/gameConfigs.js, src/data/TRAINING_LIBRARY.js) for bugs, gaps or improvements using PIO, CHART, and SCENARIO systems." --agents 5
