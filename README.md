# BioInfoAI – AI-Assisted Bioinformatics Tool Navigator

<p align="center">
  <img src="public/BioInfoAI.svg" alt="BioInfoAI Logo" width="750">
</p>

BioInfoAI is an AI-powered platform designed to help researchers discover, explore, and run bioinformatics tools more efficiently. Instead of manually searching through tool lists and documentation, users can ask natural-language questions or browse tools interactively.

The platform combines semantic search, structured tool metadata, and LLM-based assistance to recommend suitable tools, explain their usage, and generate runnable commands for HPC environments such as Draco.

## Features

- AI chatbot assistance for natural-language queries
- Semantic search for bioinformatics tools
- Tool recommendations based on task and sequencing technology
- Automatic command generation
- Interactive tool navigator and filtering
- Structured tool metadata and ontology
- Supports reproducible workflows
- Designed for HPC environments and scalable analysis pipelines

## Example use cases

Ask questions such as:

- "Which tool should I use for Nanopore read quality control?"
- "Find tools for metagenome binning"
- "How do I run Kraken2 on Draco?"
- "Suggest a tool for antimicrobial resistance detection"

## Technology stack

- React + Vite
- OpenAI LLM integration
- FAISS semantic search
- SentenceTransformers embeddings
- Python backend
- Structured YAML/JSON tool ontology

## Goal

To reduce the time spent searching documentation and selecting tools by providing an intelligent assistant for bioinformatics workflows.
