#!/bin/bash

# Script to push all files from local git repo to GitHub
REPO_OWNER="ben4mn"
REPO_NAME="SecretSanta"
BRANCH="main"

echo "🚀 Starting comprehensive push to GitHub..."
echo "Repository: https://github.com/$REPO_OWNER/$REPO_NAME"
echo ""

# Get list of all files in git
FILES=$(git ls-files)

# Count total files
TOTAL=$(echo "$FILES" | wc -l | tr -d ' ')
echo "📦 Found $TOTAL files to push"
echo ""

# Function to push a single file
push_file() {
    local file=$1
    local count=$2
    local total=$3

    echo "[$count/$total] Pushing: $file"

    # Skip if file doesn't exist
    if [ ! -f "$file" ]; then
        echo "  ⚠️  Skipped (doesn't exist)"
        return
    fi

    # Read file content and encode for JSON
    content=$(cat "$file" | jq -Rs .)

    # Create JSON payload
    json=$(cat <<EOF
{
  "owner": "$REPO_OWNER",
  "repo": "$REPO_NAME",
  "path": "$file",
  "content": $content,
  "message": "Add $file",
  "branch": "$BRANCH"
}
EOF
)

    # Push via GitHub API (this would need to be called via Claude's MCP tool)
    echo "  ✅ Prepared for push"
}

# Export function for use
export -f push_file

# Process each file
counter=1
while IFS= read -r file; do
    push_file "$file" $counter $TOTAL
    counter=$((counter + 1))
done <<< "$FILES"

echo ""
echo "✨ Script preparation complete!"
echo "Note: Files are prepared but need to be pushed via GitHub API"
