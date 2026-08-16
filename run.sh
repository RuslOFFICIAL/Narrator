#!/bin/sh
cd "$(dirname "$0")" || exit

echo "Make sure there is only one host of bot!" && echo

npm install
node --watch narrator.js