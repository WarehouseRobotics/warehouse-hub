---
type: core-spec
description: Describes ways to configurate the Business API
project_dir: business-api
frozen: false
see_also:
  - docs/LLM APIs and Usage.md
---

The platform interacts with LLM APIs in two distinct ways:

* Directly, using Langchain agentic LLM API wrappers
* Indirectly, by sending requests to the parent internal agent, that may in turn use internal LLM APIs and return some results