---
type: core-spec
description: Describes ways to configurate the Business API
project_dir: business-api
frozen: false
see_also:
  - docs/apps/Business Foundation API.md
---

# Business API Platform Configuration

Many aspects of the Business API can be configured through YAML files (either in `$project_dir/config/` or in `~/.wrobo-hub/`):

* Bootstrapping configuration - config/bootstrap.yaml
* Admin API configuration - config/api.yaml
* LLM configuration - config/llms.yaml
* CLI tools configuration - config/cli.yaml