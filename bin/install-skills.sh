#!/bin/sh
set -eu

# Installs OpenClaw skills from this repository into the local shared skills folder.
#
# Supported target overrides:
# - OPENCLAW_SHARED_SKILLS_DIR
# - OPENCLAW_SKILLS_DIR
#
# Default target discovery:
# - ~/.openclaw/shared/skills
# - ~/.openclaw/skills

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SOURCE_DIR="$REPO_DIR/openclaw/skills"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source skills directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if [ "${OPENCLAW_SHARED_SKILLS_DIR:-}" != "" ]; then
  TARGET_DIR="$OPENCLAW_SHARED_SKILLS_DIR"
elif [ "${OPENCLAW_SKILLS_DIR:-}" != "" ]; then
  TARGET_DIR="$OPENCLAW_SKILLS_DIR"
elif [ -d "$HOME/.openclaw/shared" ] || [ ! -d "$HOME/.openclaw/skills" ]; then
  TARGET_DIR="$HOME/.openclaw/shared/skills"
else
  TARGET_DIR="$HOME/.openclaw/skills"
fi

mkdir -p "$TARGET_DIR"

installed_any=false

echo "Installing OpenClaw skills"
echo "  Source: $SOURCE_DIR"
echo "  Target: $TARGET_DIR"

for skill_dir in "$SOURCE_DIR"/*; do
  [ -d "$skill_dir" ] || continue

  skill_name=$(basename "$skill_dir")

  if [ ! -f "$skill_dir/SKILL.md" ]; then
    echo "  Skipping $skill_name (missing SKILL.md)"
    continue
  fi

  installed_any=true
  destination="$TARGET_DIR/$skill_name"

  echo "  Copying $skill_name ..."
  rm -rf "$destination"
  cp -R "$skill_dir" "$destination"
done

if [ "$installed_any" = false ]; then
  echo "No installable skills found in $SOURCE_DIR" >&2
  exit 1
fi

echo "Done"
