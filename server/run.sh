#!/bin/bash
# Script to run the streaming service server
# Automatically activates virtual environment if it exists

cd "$(dirname "$0")"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
elif [ -d ".venv" ]; then
    echo "Activating virtual environment..."
    source .venv/bin/activate
fi

# Run the server
python3 streaming_service.py

