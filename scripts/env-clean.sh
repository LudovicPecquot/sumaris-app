#!/bin/bash

# Get to the root project
if [[ ! -d "${PROJECT_DIR}" ]]; then
  cd ..
  PROJECT_DIR=`pwd`
fi;
if [[ ! -f "${PROJECT_DIR}/package.json" ]]; then
  echo "Invalid project dir: file 'package.json' not found in ${PROJECT_DIR}"
  echo "-> Make sur to run the script 'prepare_env.sh' from the project directory, or export env variable 'PROJECT_DIR'"
  exit 1
fi;

cd ${PROJECT_DIR}

#echo "--- Cleaning project dependencies..."
#rm -rf node_modules

echo "--- Cleaning Cordova plugins..."
rm -rf plugins

echo "--- Cleaning Android platform..."
rm -rf platforms/android
