# LLM APIs and Usage

Warehouse Hub is privacy-orietented, so by default we allow users to configure private cloud or local APIs for LLM functions (embedings, completions, responses, image analysis, etc).


## Providers Configuration

Admins should be able to configure which models are used for various internal tasks:

* Embeddings model endpoint config
* Summarization model endpoint
* Reranking-LLM model endpoint
* Nano-LLM model endpoint
* Capable LLM model endpoint

Some parts of configuration can be automatically loaded from the related Openclaw json config file.
