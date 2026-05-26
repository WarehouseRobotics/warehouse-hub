#!/bin/sh
set -eu

# Installs Warehouse Hub skills from this repository.
#
# With a target project argument, installs skills into detected Codex/Claude
# project skill folders using symlinks:
#
#   bin/install-skills.sh /path/to/project
#
# With no arguments, preserves the legacy OpenClaw shared-skills copy install.
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

usage() {
  echo "Usage: $0 [target-project-dir]" >&2
}

install_openclaw_skills() {
  if [ "${OPENCLAW_SHARED_SKILLS_DIR:-}" != "" ]; then
    target_dir="$OPENCLAW_SHARED_SKILLS_DIR"
  elif [ "${OPENCLAW_SKILLS_DIR:-}" != "" ]; then
    target_dir="$OPENCLAW_SKILLS_DIR"
  elif [ -d "$HOME/.openclaw/shared" ] || [ ! -d "$HOME/.openclaw/skills" ]; then
    target_dir="$HOME/.openclaw/shared/skills"
  else
    target_dir="$HOME/.openclaw/skills"
  fi

  mkdir -p "$target_dir"

  installed_any=false

  echo "Installing OpenClaw skills"
  echo "  Source: $SOURCE_DIR"
  echo "  Target: $target_dir"

  for skill_dir in "$SOURCE_DIR"/*; do
    [ -d "$skill_dir" ] || continue

    skill_name=$(basename "$skill_dir")

    if [ ! -f "$skill_dir/SKILL.md" ]; then
      echo "  Skipping $skill_name (missing SKILL.md)"
      continue
    fi

    installed_any=true
    destination="$target_dir/$skill_name"

    echo "  Copying $skill_name ..."
    rm -rf "$destination"
    cp -R "$skill_dir" "$destination"
  done

  if [ "$installed_any" = false ]; then
    echo "No installable skills found in $SOURCE_DIR" >&2
    exit 1
  fi

  echo "Done"
}

link_skill() {
  skill_dir=$1
  destination=$2

  if [ -L "$destination" ]; then
    current_target=$(readlink "$destination")
    if [ "$current_target" = "$skill_dir" ]; then
      echo "    Exists $(basename "$destination")"
      return 0
    fi

    echo "    Replacing stale symlink $(basename "$destination")"
    rm "$destination"
  elif [ -e "$destination" ]; then
    echo "Conflict: $destination already exists and is not a symlink." >&2
    echo "Remove or rename it before re-running this installer." >&2
    exit 1
  fi

  ln -s "$skill_dir" "$destination"
  echo "    Linked $(basename "$destination")"
}

install_project_skills() {
  project_dir=$1

  if [ ! -d "$project_dir" ]; then
    echo "Target project directory not found: $project_dir" >&2
    exit 1
  fi

  detected_any=false
  installed_any=false

  echo "Installing Business API skills"
  echo "  Source: $SOURCE_DIR"
  echo "  Project: $project_dir"

  for agent_dir in "$project_dir/.codex" "$project_dir/.claude"; do
    [ -d "$agent_dir" ] || continue

    detected_any=true
    target_dir="$agent_dir/skills"
    mkdir -p "$target_dir"

    echo "  Target: $target_dir"

    for skill_dir in "$SOURCE_DIR"/*; do
      [ -d "$skill_dir" ] || continue

      skill_name=$(basename "$skill_dir")

      if [ ! -f "$skill_dir/SKILL.md" ]; then
        echo "    Skipping $skill_name (missing SKILL.md)"
        continue
      fi

      installed_any=true
      link_skill "$skill_dir" "$target_dir/$skill_name"
    done
  done

  if [ "$detected_any" = false ]; then
    echo "No Codex or Claude setup found in $project_dir." >&2
    echo "Expected at least one of: $project_dir/.codex or $project_dir/.claude" >&2
    exit 1
  fi

  if [ "$installed_any" = false ]; then
    echo "No installable skills found in $SOURCE_DIR" >&2
    exit 1
  fi

  echo "Done"
}

if [ "$#" -gt 1 ]; then
  usage
  exit 1
fi

if [ "$#" -eq 1 ]; then
  install_project_skills "$1"
else
  install_openclaw_skills
fi
