---
type: core-spec
description: Describes the general outlines of how Warehouse Hub components (primarily the Business API) interact with service LLM APIs used for embeddings and data search. 
project_dir: business-api
frozen: false
see_also:
  - docs/aspects/LLM APIs and Usage.md
---

# LLM APIs and Usage

Warehouse Hub is privacy-orietented, so by default we allow users to configure private cloud or local APIs for LLM functions (embedings, completions, responses, image analysis, etc).


## Providers Configuration

Admins should be able to configure which models are used for various internal tasks:

* Embeddings model endpoint config
* Summarization model endpoint (a model that can summarize contexts of up to 10k tokens)
* Reranking-LLM model endpoint
* Nano-LLM model endpoint (mini/nano models for short simple tasks)
* Capable LLM model endpoint (deepseek, sonnet etc)

Some parts of configuration can be automatically loaded from the related Openclaw json config file.


## LLMs Config

The `llms.yaml` config file is locate tn the Warehouse Hub config folder (simply current project dir in Docker or `~/.wrobo-hub/`). This config indicates which endpoints can be used for different LLM-related tasks. The embedding endpoint is the most used, since it enabled our vector search functionality for documents, tasks, deals and so on.

```yaml
llms:
  embedding:
    style: openai-compatible
    endpoint: http://192.168.0.25:1234/v1
    model_name: text-embedding-embeddinggemma-300m-qat
    apiKey: "sk-..."
    default_dims: 768
  query_expander:
    style: openai-compatible
    endpoint: http://192.168.0.25:1234/v1
    model_name: qwen3-1.7b
    apiKey: "sk-..."    
  reranking:
    style: openai-compatible
    endpoint: http://192.168.0.25:1234/v1
    name: qwen3-reranker-0.6b      
    apiKey: "sk-..."    
  nano:
    style: openai-compatible
    endpoint: http://192.168.0.25:1234/v1
    model_name: qwen3-1.7b
    apiKey: "sk-..."    
    thinking: off
  capable:
    style: openai-compatible
    endpoint: http://192.168.0.25:1234/v1
    model_name: qwen3-1.7b
    apiKey: "sk-..."    
    thinking: medium
```

The 'thinking' parameter for models is mapped automatically to closes available option by the LLM adapter in the Business API.