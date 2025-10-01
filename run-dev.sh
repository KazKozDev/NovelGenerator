#!/bin/bash

# Wrapper script to run vite with correct node path

cd "$(dirname "$0")"

# Use absolute path to node
/usr/local/bin/node node_modules/.bin/vite
