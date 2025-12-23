#!/bin/bash
# Setup script for Google Cloud authentication

echo "Setting up Google Cloud authentication for Vertex AI..."

# Add gcloud to PATH if not already there
if ! command -v gcloud &> /dev/null; then
    export PATH=/opt/homebrew/share/google-cloud-sdk/bin:"$PATH"
    echo "Added gcloud to PATH for this session"
fi

# Set Python for gcloud
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "ERROR: gcloud CLI is not installed or not in PATH"
    echo "Please install it with: brew install --cask gcloud-cli"
    echo "Then add to your PATH: export PATH=/opt/homebrew/share/google-cloud-sdk/bin:\$PATH"
    exit 1
fi

echo "gcloud version:"
gcloud --version

echo ""
echo "To authenticate with Google Cloud, run:"
echo "  gcloud auth application-default login"
echo ""
echo "This will open a browser window for you to sign in."
echo ""
echo "After authentication, you can verify with:"
echo "  gcloud auth application-default print-access-token"
echo ""
echo "To set your project (if needed):"
echo "  gcloud config set project YOUR_PROJECT_ID"

